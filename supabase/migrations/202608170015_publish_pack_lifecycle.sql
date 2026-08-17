-- M12 PublishPack lifecycle. Content Discovery and Community Post generation
-- are separate provider-neutral AI runs over one immutable completed Report.

alter table public.publish_packs
  add column discovery_provider text check (discovery_provider is null or discovery_provider in ('zhipu', 'deepseek')),
  add column discovery_model text,
  add column discovery_prompt_version text,
  add column discovery_input_signature text,
  add column discovery_input_tokens bigint check (discovery_input_tokens is null or discovery_input_tokens >= 0),
  add column discovery_output_tokens bigint check (discovery_output_tokens is null or discovery_output_tokens >= 0),
  add column discovery_latency_ms integer check (discovery_latency_ms is null or discovery_latency_ms >= 0),
  add column discovery_estimated_cost numeric(14, 6) check (discovery_estimated_cost is null or discovery_estimated_cost >= 0),
  add column discovery_started_at timestamptz,
  add column discovered_at timestamptz,
  add column generation_started_at timestamptz;

create or replace function private.validate_publish_pack_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'A PublishPack must start as draft'; end if;
    return new;
  end if;
  if old.status in ('ready', 'failed') then
    raise exception 'Terminal PublishPack % is immutable; create a new version to regenerate', old.id;
  end if;
  if not ((old.status = 'draft' and new.status in ('discovering', 'generating', 'failed'))
    or (old.status = 'discovering' and new.status in ('draft', 'failed'))
    or (old.status = 'generating' and new.status in ('ready', 'failed'))
    or old.status = new.status) then
    raise exception 'Invalid PublishPack status transition: % -> %', old.status, new.status;
  end if;
  if new.status = 'ready' then
    if not exists (select 1 from public.publish_pack_artifacts where publish_pack_id = new.id) then
      raise exception 'A ready PublishPack must retain at least one screenshot Artifact';
    end if;
    new.completed_at := coalesce(new.completed_at, now());
  end if;
  return new;
end;
$$;

create function public.begin_publish_pack(p_project_id uuid, p_report_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  latest_pack public.publish_packs%rowtype;
  next_version integer;
  new_pack_id uuid;
begin
  perform 1
  from public.reports report
  join public.result_analyses analysis on analysis.id = report.result_analysis_id
  join public.projects project on project.id = report.project_id
  where report.id = p_report_id
    and report.project_id = p_project_id
    and report.status = 'completed'
    and analysis.status = 'completed'
    and analysis.final_score_signature = private.final_score_signature(analysis.review_session_id)
    and project.status in ('reported', 'published')
    and project.deleted_at is null;
  if not found then raise exception 'PublishPack requires a current completed Report'; end if;

  select * into latest_pack from public.publish_packs
  where report_id = p_report_id order by version desc limit 1;
  if latest_pack.status = 'draft' then return latest_pack.id; end if;
  if latest_pack.status in ('discovering', 'generating') then raise exception 'A PublishPack run is already active'; end if;

  select coalesce(max(version), 0) + 1 into next_version
  from public.publish_packs where report_id = p_report_id;
  insert into public.publish_packs (project_id, report_id, version, status, config, content_ideas, selected_idea)
  values (
    p_project_id, p_report_id, next_version, 'draft',
    coalesce(latest_pack.config, '{}'::jsonb),
    coalesce(latest_pack.content_ideas, '[]'::jsonb),
    latest_pack.selected_idea
  )
  returning id into new_pack_id;
  return new_pack_id;
end;
$$;

create function public.start_content_discovery(
  p_publish_pack_id uuid,
  p_provider text,
  p_model text,
  p_prompt_version text,
  p_input_signature text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_provider not in ('zhipu', 'deepseek') or char_length(btrim(p_model)) = 0
    or char_length(btrim(p_prompt_version)) = 0 or char_length(btrim(p_input_signature)) = 0 then
    raise exception 'Content Discovery route metadata is invalid';
  end if;
  update public.publish_packs
  set status = 'discovering', content_ideas = '[]'::jsonb, selected_idea = null,
      community_post = null, error_message = null,
      discovery_provider = p_provider, discovery_model = btrim(p_model),
      discovery_prompt_version = btrim(p_prompt_version), discovery_input_signature = btrim(p_input_signature),
      discovery_started_at = now(), discovered_at = null, updated_at = now()
  where id = p_publish_pack_id and status = 'draft';
  if not found then raise exception 'PublishPack is not ready for Content Discovery'; end if;
end;
$$;

create function public.complete_content_discovery(p_publish_pack_id uuid, p_content_ideas jsonb, p_usage jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(p_content_ideas) <> 'array' or jsonb_array_length(p_content_ideas) = 0 then
    raise exception 'Content Discovery requires dynamic ContentIdeas';
  end if;
  update public.publish_packs
  set status = 'draft', content_ideas = p_content_ideas,
      discovery_input_tokens = nullif(p_usage->>'inputTokens', '')::bigint,
      discovery_output_tokens = nullif(p_usage->>'outputTokens', '')::bigint,
      discovery_latency_ms = nullif(p_usage->>'latencyMs', '')::integer,
      discovery_estimated_cost = nullif(p_usage->>'estimatedCost', '')::numeric,
      discovered_at = now(), updated_at = now()
  where id = p_publish_pack_id and status = 'discovering';
  if not found then raise exception 'Content Discovery is not running'; end if;
end;
$$;

create function public.start_community_post(
  p_publish_pack_id uuid,
  p_selected_idea jsonb,
  p_config jsonb,
  p_provider text,
  p_model text,
  p_prompt_version text,
  p_input_signature text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_pack public.publish_packs%rowtype;
begin
  select * into target_pack from public.publish_packs
  where id = p_publish_pack_id and status = 'draft' for update;
  if target_pack.id is null or jsonb_array_length(target_pack.content_ideas) = 0 then
    raise exception 'Community Post requires completed Content Discovery';
  end if;
  if jsonb_typeof(p_selected_idea) <> 'object' or jsonb_typeof(p_config) <> 'object'
    or (p_config->>'imageCount')::integer not between 1 and 9
    or p_provider not in ('zhipu', 'deepseek') or char_length(btrim(p_model)) = 0
    or char_length(btrim(p_prompt_version)) = 0 or char_length(btrim(p_input_signature)) = 0 then
    raise exception 'Community Post input is invalid';
  end if;
  if p_selected_idea->>'id' <> 'custom' and not exists (
    select 1 from jsonb_array_elements(target_pack.content_ideas) idea
    where idea->>'id' = p_selected_idea->>'id'
  ) then raise exception 'Selected ContentIdea does not belong to this PublishPack'; end if;
  update public.publish_packs
  set status = 'generating', selected_idea = p_selected_idea, config = p_config,
      provider = p_provider, model = btrim(p_model), prompt_version = btrim(p_prompt_version),
      input_signature = btrim(p_input_signature), generation_started_at = now(), updated_at = now()
  where id = target_pack.id;
end;
$$;

create function public.complete_publish_pack(
  p_publish_pack_id uuid,
  p_community_post jsonb,
  p_recommendations jsonb,
  p_usage jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_pack public.publish_packs%rowtype;
  recommendation jsonb;
begin
  select * into target_pack from public.publish_packs
  where id = p_publish_pack_id and status = 'generating' for update;
  if target_pack.id is null then raise exception 'Community Post is not generating'; end if;
  if jsonb_typeof(p_community_post) <> 'object' or jsonb_typeof(p_recommendations) <> 'array'
    or jsonb_array_length(p_recommendations) not between 1 and 9 then
    raise exception 'Community Post output is invalid';
  end if;
  for recommendation in select value from jsonb_array_elements(p_recommendations)
  loop
    insert into public.publish_pack_artifacts (
      publish_pack_id, artifact_id, display_order, reason, supports_claim, supports_paragraph
    ) values (
      target_pack.id,
      (recommendation->>'artifactId')::uuid,
      (recommendation->>'order')::smallint,
      btrim(recommendation->>'reason'),
      nullif(btrim(coalesce(recommendation->>'supportsClaim', '')), ''),
      nullif(recommendation->>'supportsParagraph', '')::integer
    );
  end loop;
  update public.publish_packs
  set status = 'ready', community_post = p_community_post,
      input_tokens = nullif(p_usage->>'inputTokens', '')::bigint,
      output_tokens = nullif(p_usage->>'outputTokens', '')::bigint,
      latency_ms = nullif(p_usage->>'latencyMs', '')::integer,
      estimated_cost = nullif(p_usage->>'estimatedCost', '')::numeric,
      updated_at = now()
  where id = target_pack.id;
  update public.projects set status = 'published', updated_at = now()
  where id = target_pack.project_id and status = 'reported';
end;
$$;

create function public.fail_publish_pack(p_publish_pack_id uuid, p_error_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare safe_error text := left(btrim(coalesce(p_error_message, '')), 1000);
begin
  if char_length(safe_error) = 0 then safe_error := 'PublishPack generation failed'; end if;
  update public.publish_packs set status = 'failed', error_message = safe_error, updated_at = now()
  where id = p_publish_pack_id and status in ('draft', 'discovering', 'generating');
end;
$$;

revoke all on function public.begin_publish_pack(uuid, uuid) from public, anon, authenticated;
revoke all on function public.start_content_discovery(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.complete_content_discovery(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.start_community_post(uuid, jsonb, jsonb, text, text, text, text) from public, anon, authenticated;
revoke all on function public.complete_publish_pack(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.fail_publish_pack(uuid, text) from public, anon, authenticated;
grant execute on function public.begin_publish_pack(uuid, uuid) to service_role;
grant execute on function public.start_content_discovery(uuid, text, text, text, text) to service_role;
grant execute on function public.complete_content_discovery(uuid, jsonb, jsonb) to service_role;
grant execute on function public.start_community_post(uuid, jsonb, jsonb, text, text, text, text) to service_role;
grant execute on function public.complete_publish_pack(uuid, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.fail_publish_pack(uuid, text) to service_role;
