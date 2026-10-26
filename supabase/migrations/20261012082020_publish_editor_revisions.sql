-- Additive, service-only revisions. Completed articles remain immutable.
create function public.create_publish_revision(
  p_project_id uuid, p_source_pack_id uuid, p_mode text,
  p_copy jsonb default '{}'::jsonb, p_recommendations jsonb default '[]'::jsonb
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  source_pack public.publish_packs%rowtype;
  latest_id uuid;
  revision_id uuid;
  job_id uuid;
  next_version integer;
  new_post jsonb;
  recommendation jsonb;
begin
  perform 1 from public.projects where id=p_project_id and deleted_at is null for update;
  if not found then raise exception 'Active project required'; end if;
  select * into source_pack from public.publish_packs where id=p_source_pack_id and project_id=p_project_id;
  if source_pack.id is null or not (source_pack.status='ready' or
    (p_mode='regenerate' and source_pack.status in ('draft','generating','failed') and source_pack.community_post ? 'regeneration' and exists (select 1 from public.quick_jobs where id=(source_pack.community_post->'regeneration'->>'jobId')::uuid and project_id=p_project_id and status='failed'))) then
    raise exception 'Revision requires a completed article';
  end if;
  if source_pack.status in ('draft','generating') then
    update public.publish_packs set status='failed',error_message='后台任务中断，创建新版本重试。' where id=source_pack.id;
  end if;
  if source_pack.report_id is not null then
    perform 1 from public.reports where id=source_pack.report_id for update;
  else
    perform 1 from public.experience_findings where id=source_pack.findings_id for update;
  end if;
  select id into latest_id from public.publish_packs
    where report_id=source_pack.report_id or findings_id=source_pack.findings_id order by version desc limit 1;
  if latest_id is distinct from p_source_pack_id then raise exception 'Article version changed; reload before saving'; end if;
  if p_mode is null or p_mode not in ('manual','regenerate') then raise exception 'Invalid revision mode'; end if;
  if p_mode='manual' then
    if coalesce(jsonb_typeof(p_copy),'')<>'object' or
      exists (select 1 from jsonb_object_keys(p_copy) key where key not in ('title','body','tags','interactionQuestion')) or
      coalesce(jsonb_typeof(p_copy->'title'),'')<>'string' or char_length(btrim(p_copy->>'title')) not between 1 and 240 or
      coalesce(jsonb_typeof(p_copy->'body'),'')<>'string' or char_length(btrim(p_copy->>'body')) not between 1 and 12000 or
      coalesce(jsonb_typeof(p_copy->'tags'),'')<>'array' or jsonb_array_length(p_copy->'tags') not between 1 and 12 or
      coalesce(jsonb_typeof(p_copy->'interactionQuestion'),'')<>'string' or char_length(p_copy->>'interactionQuestion')>600 or
      coalesce(jsonb_typeof(p_recommendations),'')<>'array' or jsonb_array_length(p_recommendations)>9 then
      raise exception 'Invalid article copy';
    end if;
    if exists (select 1 from jsonb_array_elements(p_copy->'tags') tag
      where jsonb_typeof(tag)<>'string' or char_length(btrim(tag#>>'{}')) not between 1 and 40) then
      raise exception 'Invalid article tags';
    end if;
    new_post := (source_pack.community_post - 'regeneration') || p_copy || jsonb_build_object(
      'manualEdit',jsonb_build_object('sourcePackId',source_pack.id,'savedAt',now(),'aiReviewed',false));
  else
    new_post := source_pack.community_post;
  end if;
  select coalesce(max(version),0)+1 into next_version from public.publish_packs
    where report_id=source_pack.report_id or findings_id=source_pack.findings_id;
  insert into public.publish_packs(
    project_id,report_id,findings_id,version,status,config,content_ideas,selected_idea,
    discovery_provider,discovery_model,discovery_prompt_version,discovery_input_signature,
    discovery_input_tokens,discovery_output_tokens,discovery_latency_ms,discovery_estimated_cost,
    discovery_started_at,discovered_at,community_post
  ) values (
    p_project_id,source_pack.report_id,source_pack.findings_id,next_version,'draft',source_pack.config,
    source_pack.content_ideas,source_pack.selected_idea,source_pack.discovery_provider,source_pack.discovery_model,
    source_pack.discovery_prompt_version,source_pack.discovery_input_signature,source_pack.discovery_input_tokens,
    source_pack.discovery_output_tokens,source_pack.discovery_latency_ms,source_pack.discovery_estimated_cost,
    source_pack.discovery_started_at,source_pack.discovered_at,new_post
  ) returning id into revision_id;
  if p_mode='regenerate' then
    insert into public.quick_jobs(project_id,kind,scope,payload)
      values(p_project_id,'publish','article-revision:'||revision_id::text,
        jsonb_build_object('mode','regenerate','packId',revision_id,'sourcePackId',source_pack.id)) returning id into job_id;
    update public.publish_packs set community_post=new_post || jsonb_build_object('regeneration',
      jsonb_build_object('sourcePackId',source_pack.id,'jobId',job_id,'requestedAt',now())) where id=revision_id;
    return revision_id;
  end if;
  update public.publish_packs set status='generating',provider=source_pack.provider,model=source_pack.model,
    prompt_version=source_pack.prompt_version,input_signature=source_pack.input_signature,
    generation_started_at=now(),updated_at=now() where id=revision_id;
  for recommendation in select value from jsonb_array_elements(p_recommendations) loop
    insert into public.publish_pack_artifacts(publish_pack_id,artifact_id,display_order,reason,supports_claim,supports_paragraph)
      values(revision_id,(recommendation->>'artifactId')::uuid,(recommendation->>'order')::integer,
        recommendation->>'reason',recommendation->>'supportsClaim',(recommendation->>'supportsParagraph')::integer);
  end loop;
  -- AI route remains provenance of the source, not a new model call or review.
  update public.publish_packs set status='ready',updated_at=now() where id=revision_id;
  return revision_id;
end;
$$;
revoke all on function public.create_publish_revision(uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_publish_revision(uuid,uuid,text,jsonb,jsonb) to service_role;

-- Existing jobs stay quick-only; explicit article revisions can also run for
-- professional projects. Preserve fixture isolation, leases and serialization.
create or replace function public.claim_quick_job(p_project_id uuid default null)
returns setof public.quick_jobs language plpgsql security invoker set search_path = '' as $$
declare target_id uuid;
begin
  -- A dead worker is recoverable; repeated process deaths become an explicit failure.
  update public.quick_jobs set status = 'failed', lease_token = null, lease_until = null,
    error_message = '后台任务多次中断，请重试当前阶段。', updated_at = now()
    where status = 'running' and lease_until < now() and attempts >= 3;
  select j.id into target_id from public.quick_jobs j
    join public.projects p on p.id = j.project_id
    where p.deleted_at is null and (p.evaluation_mode = 'quick' or (j.kind='publish' and j.payload->>'mode'='regenerate'))
      and (p_project_id is null or j.project_id = p_project_id)
      -- Reserved test fixtures require an explicit project-scoped worker.
      and (p_project_id is not null or p.name not like '[E2E]%')
      and ((j.status = 'queued' and j.available_at <= now()) or (j.status = 'running' and j.lease_until < now()))
      and not exists (select 1 from public.quick_jobs active where active.project_id = j.project_id
        and active.id <> j.id and active.status = 'running' and active.lease_until >= now())
    order by case when j.kind in ('analysis','report') then 1 else 0 end, j.created_at
    for update of j skip locked limit 1;
  if target_id is null then return; end if;
  -- Serialize claims for one project, including different kinds.
  perform pg_advisory_xact_lock(hashtextextended((select project_id::text from public.quick_jobs where id = target_id), 0));
  if exists (select 1 from public.quick_jobs active where active.project_id = (select project_id from public.quick_jobs where id = target_id)
      and active.id <> target_id and active.status = 'running' and active.lease_until >= now()) then return; end if;
  return query update public.quick_jobs set status = 'running', attempts = attempts + 1,
    lease_token = gen_random_uuid(), lease_until = now() + interval '15 minutes', updated_at = now(), error_message = null
    where id = target_id returning *;
end;
$$;
