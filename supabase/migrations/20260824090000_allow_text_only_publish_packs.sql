-- A publishable article may be backed by text, code, PDF, or video evidence
-- without requiring a fabricated screenshot. Image recommendations remain
-- optional and, when present, still reference immutable image TestArtifacts.

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
    new.completed_at := coalesce(new.completed_at, now());
  end if;
  return new;
end;
$$;

create or replace function public.start_community_post(
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
    or (p_config->>'imageCount')::integer not between 0 and 9
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

create or replace function public.complete_publish_pack(
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
    or jsonb_array_length(p_recommendations) not between 0 and 9 then
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

revoke all on function public.start_community_post(uuid, jsonb, jsonb, text, text, text, text) from public, anon, authenticated;
revoke all on function public.complete_publish_pack(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.start_community_post(uuid, jsonb, jsonb, text, text, text, text) to service_role;
grant execute on function public.complete_publish_pack(uuid, jsonb, jsonb, jsonb) to service_role;
