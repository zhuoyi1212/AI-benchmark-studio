-- Preserve Content Discovery provenance when Community Post generation is
-- retried in a new PublishPack version.

create or replace function public.begin_publish_pack(p_project_id uuid, p_report_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  latest_pack public.publish_packs%rowtype;
  discovery_pack public.publish_packs%rowtype;
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

  select * into discovery_pack from public.publish_packs
  where report_id = p_report_id
    and discovery_provider is not null
    and discovered_at is not null
  order by version desc limit 1;

  select coalesce(max(version), 0) + 1 into next_version
  from public.publish_packs where report_id = p_report_id;
  insert into public.publish_packs (
    project_id, report_id, version, status, config, content_ideas, selected_idea,
    discovery_provider, discovery_model, discovery_prompt_version,
    discovery_input_signature, discovery_input_tokens, discovery_output_tokens,
    discovery_latency_ms, discovery_estimated_cost, discovery_started_at,
    discovered_at
  ) values (
    p_project_id, p_report_id, next_version, 'draft',
    coalesce(latest_pack.config, '{}'::jsonb),
    coalesce(latest_pack.content_ideas, '[]'::jsonb),
    latest_pack.selected_idea,
    discovery_pack.discovery_provider, discovery_pack.discovery_model,
    discovery_pack.discovery_prompt_version, discovery_pack.discovery_input_signature,
    discovery_pack.discovery_input_tokens, discovery_pack.discovery_output_tokens,
    discovery_pack.discovery_latency_ms, discovery_pack.discovery_estimated_cost,
    discovery_pack.discovery_started_at, discovery_pack.discovered_at
  )
  returning id into new_pack_id;
  return new_pack_id;
end;
$$;

-- Repair rows created by the first retry implementation. Terminal rows remain
-- immutable to application code; this migration briefly removes only the
-- lifecycle trigger while filling provenance from the latest completed
-- discovery run for the same Report.
drop trigger publish_packs_validate_transition on public.publish_packs;

with lineage as (
  select target.id,
    source.discovery_provider, source.discovery_model,
    source.discovery_prompt_version, source.discovery_input_signature,
    source.discovery_input_tokens, source.discovery_output_tokens,
    source.discovery_latency_ms, source.discovery_estimated_cost,
    source.discovery_started_at, source.discovered_at
  from public.publish_packs target
  cross join lateral (
    select candidate.*
    from public.publish_packs candidate
    where candidate.report_id = target.report_id
      and candidate.version < target.version
      and candidate.discovery_provider is not null
      and candidate.discovered_at is not null
    order by candidate.version desc
    limit 1
  ) source
  where target.discovery_provider is null
    and jsonb_array_length(target.content_ideas) > 0
)
update public.publish_packs target
set discovery_provider = source.discovery_provider,
    discovery_model = source.discovery_model,
    discovery_prompt_version = source.discovery_prompt_version,
    discovery_input_signature = source.discovery_input_signature,
    discovery_input_tokens = source.discovery_input_tokens,
    discovery_output_tokens = source.discovery_output_tokens,
    discovery_latency_ms = source.discovery_latency_ms,
    discovery_estimated_cost = source.discovery_estimated_cost,
    discovery_started_at = source.discovery_started_at,
    discovered_at = source.discovered_at
from lineage source
where target.id = source.id;

create trigger publish_packs_validate_transition
before insert or update on public.publish_packs
for each row execute function private.validate_publish_pack_transition();

revoke all on function public.begin_publish_pack(uuid, uuid) from public, anon, authenticated;
grant execute on function public.begin_publish_pack(uuid, uuid) to service_role;
