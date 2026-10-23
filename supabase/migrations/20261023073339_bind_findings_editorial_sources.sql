-- Bind newly discovered and regenerated articles to the effective editorial Findings.
create or replace function public.begin_findings_publish_pack(
  p_project_id uuid,
  p_findings_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_findings public.experience_findings%rowtype;
  latest_pack public.publish_packs%rowtype;
  next_version integer;
  new_pack_id uuid;
begin
  select * into target_findings
  from public.experience_findings
  where id = p_findings_id
    and project_id = p_project_id
    and status = 'completed'
    and human_confirmed_at is not null for update;

  if target_findings.id is null then
    raise exception 'PublishPack requires confirmed Findings';
  end if;

  select * into latest_pack
  from public.publish_packs
  where findings_id = p_findings_id
  order by version desc
  limit 1;

  if latest_pack.status = 'draft' then return latest_pack.id; end if;
  if latest_pack.status in ('discovering', 'generating') then
    raise exception 'A PublishPack run is already active';
  end if;

  select coalesce(max(version), 0) + 1 into next_version
  from public.publish_packs
  where findings_id = p_findings_id;

  insert into public.publish_packs (
    project_id, report_id, findings_id, findings_revision_id, version, status, config, content_ideas, selected_idea
  ) values (
    p_project_id, null, p_findings_id, (select id from public.experience_finding_revisions where findings_id=p_findings_id and kind='editorial' order by version desc limit 1), next_version, 'draft',
    coalesce(latest_pack.config, '{}'::jsonb),
    coalesce(latest_pack.content_ideas, '[]'::jsonb),
    latest_pack.selected_idea
  )
  returning id into new_pack_id;

  return new_pack_id;
end;
$$;
revoke all on function public.begin_findings_publish_pack(uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_findings_publish_pack(uuid,uuid) to service_role;

create or replace function public.create_publish_revision(
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
  revision_config jsonb;
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
  revision_config := source_pack.config;
  if p_mode='manual' then
    if coalesce(jsonb_typeof(p_copy),'')<>'object' or
      exists (select 1 from jsonb_object_keys(p_copy) key where key not in ('title','body','tags','interactionQuestion','selectedIdea','config','findingsRevisionId','reason')) or
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
    if p_copy ? 'config' then
      if jsonb_typeof(p_copy->'config') <> 'object' then raise exception 'Invalid editorial config'; end if;
      revision_config := p_copy->'config';
    end if;
    if p_copy ? 'selectedIdea' and (jsonb_typeof(p_copy->'selectedIdea') <> 'object'
      or coalesce(p_copy->'selectedIdea'->>'id','') = '') then raise exception 'Invalid editorial idea'; end if;
    if p_copy ? 'findingsRevisionId' and (source_pack.findings_id is null or not exists (
      select 1 from public.experience_finding_revisions r where r.id=(p_copy->>'findingsRevisionId')::uuid
      and r.findings_id=source_pack.findings_id and r.kind='editorial'
      and r.version=(select max(version) from public.experience_finding_revisions where findings_id=source_pack.findings_id)
    )) then raise exception 'Finding revision changed; reload before saving'; end if;
    -- The source's AI review applies to the source article only. Its complete
    -- trace stays in the immutable source pack, never masquerades as this review.
    new_post := (source_pack.community_post - array['regeneration','storyBrief','contentBrief','draftReview',
      'naturalVoiceAudit','languagePass','editorialPlan','factCheck','articleReview','generationTrace',
      'stylePreservation','styleEdit','writingPlan','titleRefreshes']) ||
      (p_copy - array['selectedIdea','config','findingsRevisionId','reason']) || jsonb_build_object(
      'manualEdit',jsonb_build_object('sourcePackId',source_pack.id,'savedAt',now(),'aiReviewed',false,'reason',coalesce(p_copy->>'reason','编辑文章')));
  else
    if coalesce(jsonb_typeof(p_copy),'')<>'object' or
      exists(select 1 from jsonb_object_keys(p_copy) key where key<>'authorPerspective') then
      raise exception 'Invalid regeneration options';
    end if;
    if p_copy ? 'authorPerspective' then
      if coalesce(jsonb_typeof(p_copy->'authorPerspective'),'')<>'object' then
        raise exception 'Invalid author perspective';
      end if;
      if exists(select 1 from jsonb_each(p_copy->'authorPerspective') item
        where item.key not in ('goal','focus','tradeoff','verdict') or
          jsonb_typeof(item.value)<>'string' or char_length(item.value#>>'{}')>600) then
        raise exception 'Invalid author perspective fields';
      end if;
      revision_config := revision_config || jsonb_build_object('authorPerspective',p_copy->'authorPerspective');
    end if;
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
    p_project_id,source_pack.report_id,source_pack.findings_id,next_version,'draft',revision_config,
    case when p_copy ? 'selectedIdea' then jsonb_build_array(p_copy->'selectedIdea') else source_pack.content_ideas end,coalesce(p_copy->'selectedIdea',source_pack.selected_idea),source_pack.discovery_provider,source_pack.discovery_model,
    source_pack.discovery_prompt_version,source_pack.discovery_input_signature,source_pack.discovery_input_tokens,
    source_pack.discovery_output_tokens,source_pack.discovery_latency_ms,source_pack.discovery_estimated_cost,
    source_pack.discovery_started_at,source_pack.discovered_at,new_post
  ) returning id into revision_id;
  update public.publish_packs set findings_revision_id=case when p_mode='regenerate' then (select id from public.experience_finding_revisions where findings_id=source_pack.findings_id and kind='editorial' order by version desc limit 1) else coalesce((p_copy->>'findingsRevisionId')::uuid,source_pack.findings_revision_id) end where id=revision_id;
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
