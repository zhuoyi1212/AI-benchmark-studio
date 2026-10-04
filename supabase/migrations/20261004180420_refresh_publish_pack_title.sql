-- Refreshing a title creates a new immutable PublishPack version. The body,
-- evidence links, configuration, and discovery lineage are copied verbatim.

create function public.refresh_publish_pack_title(
  p_source_publish_pack_id uuid,
  p_title text,
  p_title_refresh jsonb,
  p_provider text,
  p_model text,
  p_prompt_version text,
  p_input_signature text,
  p_usage jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_pack public.publish_packs%rowtype;
  latest_pack_id uuid;
  next_version integer;
  new_pack_id uuid;
  safe_title text := btrim(coalesce(p_title, ''));
  new_post jsonb;
begin
  select * into source_pack
  from public.publish_packs
  where id = p_source_publish_pack_id
    and status = 'ready';

  if source_pack.id is null then raise exception 'Title refresh requires a ready PublishPack'; end if;
  if source_pack.report_id is not null then
    perform 1 from public.reports where id = source_pack.report_id for update;
  else
    perform 1 from public.experience_findings where id = source_pack.findings_id for update;
  end if;

  select pack.id into latest_pack_id
  from public.publish_packs pack
  where (source_pack.report_id is not null and pack.report_id = source_pack.report_id)
     or (source_pack.findings_id is not null and pack.findings_id = source_pack.findings_id)
  order by pack.version desc
  limit 1;

  if latest_pack_id is distinct from source_pack.id then
    raise exception 'Only the latest PublishPack title can be refreshed';
  end if;
  if char_length(safe_title) not between 6 and 28
    or safe_title = btrim(source_pack.community_post->>'title')
    or jsonb_typeof(p_title_refresh) <> 'object'
    or p_provider not in ('zhipu', 'deepseek')
    or char_length(btrim(coalesce(p_model, ''))) = 0
    or char_length(btrim(coalesce(p_prompt_version, ''))) = 0
    or char_length(btrim(coalesce(p_input_signature, ''))) = 0 then
    raise exception 'Title refresh input is invalid';
  end if;

  select coalesce(max(version), 0) + 1 into next_version
  from public.publish_packs pack
  where (source_pack.report_id is not null and pack.report_id = source_pack.report_id)
     or (source_pack.findings_id is not null and pack.findings_id = source_pack.findings_id);

  new_post := source_pack.community_post || jsonb_build_object(
    'title', safe_title,
    'titleRefreshes', coalesce(source_pack.community_post->'titleRefreshes', '[]'::jsonb) || jsonb_build_array(p_title_refresh)
  );

  insert into public.publish_packs (
    project_id, report_id, findings_id, version, status, config, content_ideas,
    selected_idea, discovery_provider, discovery_model, discovery_prompt_version,
    discovery_input_signature, discovery_input_tokens, discovery_output_tokens,
    discovery_latency_ms, discovery_estimated_cost, discovery_started_at, discovered_at
  ) values (
    source_pack.project_id, source_pack.report_id, source_pack.findings_id, next_version,
    'draft', source_pack.config, source_pack.content_ideas, source_pack.selected_idea,
    source_pack.discovery_provider, source_pack.discovery_model, source_pack.discovery_prompt_version,
    source_pack.discovery_input_signature, source_pack.discovery_input_tokens,
    source_pack.discovery_output_tokens, source_pack.discovery_latency_ms,
    source_pack.discovery_estimated_cost, source_pack.discovery_started_at, source_pack.discovered_at
  ) returning id into new_pack_id;

  update public.publish_packs
  set status = 'generating', community_post = new_post,
      provider = p_provider, model = btrim(p_model), prompt_version = btrim(p_prompt_version),
      input_signature = btrim(p_input_signature), generation_started_at = now(), updated_at = now()
  where id = new_pack_id;

  insert into public.publish_pack_artifacts (
    publish_pack_id, artifact_id, display_order, reason, supports_claim, supports_paragraph
  )
  select new_pack_id, artifact_id, display_order, reason, supports_claim, supports_paragraph
  from public.publish_pack_artifacts
  where publish_pack_id = source_pack.id;

  update public.publish_packs
  set status = 'ready',
      input_tokens = nullif(p_usage->>'inputTokens', '')::bigint,
      output_tokens = nullif(p_usage->>'outputTokens', '')::bigint,
      latency_ms = nullif(p_usage->>'latencyMs', '')::integer,
      estimated_cost = nullif(p_usage->>'estimatedCost', '')::numeric,
      updated_at = now()
  where id = new_pack_id;

  return new_pack_id;
end;
$$;

revoke all on function public.refresh_publish_pack_title(uuid, text, jsonb, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.refresh_publish_pack_title(uuid, text, jsonb, text, text, text, text, jsonb) to service_role;
