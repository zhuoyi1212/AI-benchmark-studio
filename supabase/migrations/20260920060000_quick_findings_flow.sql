-- Quick Findings flow: allow Test + Artifact to produce confirmed findings and publish
-- without requiring Judge, Human Review, Result Analysis, or Report.

create table public.experience_findings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  protocol_id uuid not null,
  version integer not null check (version > 0),
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  input_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(input_snapshot) = 'object'),
  input_signature text not null check (char_length(btrim(input_signature)) > 0),
  output jsonb check (output is null or jsonb_typeof(output) = 'object'),
  human_output jsonb check (human_output is null or jsonb_typeof(human_output) = 'object'),
  provider text check (provider is null or provider in ('zhipu', 'deepseek')),
  model text,
  prompt_version text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  human_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  input_tokens bigint check (input_tokens is null or input_tokens >= 0),
  output_tokens bigint check (output_tokens is null or output_tokens >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  estimated_cost numeric(14, 6) check (estimated_cost is null or estimated_cost >= 0),
  unique (project_id, protocol_id, version),
  unique (id, project_id),
  foreign key (protocol_id, project_id) references public.protocols(id, project_id) on delete restrict,
  check (status <> 'completed' or (output is not null and provider is not null and model is not null and prompt_version is not null)),
  check (status <> 'failed' or char_length(btrim(coalesce(error_message, ''))) > 0),
  check (human_confirmed_at is null or human_output is not null)
);

create index experience_findings_project_idx
  on public.experience_findings(project_id, protocol_id, version desc);

alter table public.experience_findings enable row level security;

create policy experience_findings_owner_select
on public.experience_findings for select to authenticated
using (private.is_project_owner(project_id));

revoke all on table public.experience_findings from public, anon, authenticated;
grant select on table public.experience_findings to authenticated;

create or replace function public.begin_experience_findings(
  p_project_id uuid,
  p_protocol_id uuid,
  p_input_snapshot jsonb,
  p_input_signature text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_count integer;
  ready_count integer;
  latest public.experience_findings%rowtype;
  next_version integer;
  new_id uuid;
begin
  if p_input_snapshot is null or jsonb_typeof(p_input_snapshot) <> 'object'
    or char_length(btrim(coalesce(p_input_signature, ''))) = 0 then
    raise exception 'Findings input snapshot is invalid';
  end if;

  perform 1
  from public.projects project
  join public.protocols protocol on protocol.project_id = project.id
  where project.id = p_project_id
    and project.deleted_at is null
    and protocol.id = p_protocol_id
    and protocol.status = 'locked'
    and protocol.version = (
      select max(candidate.version)
      from public.protocols candidate
      where candidate.project_id = p_project_id
    );
  if not found then raise exception 'Findings requires the current locked Protocol'; end if;

  select
    (select count(*) from public.test_cases where protocol_id = p_protocol_id)
      * (select count(*) from public.project_products where project_id = p_project_id),
    count(*)
  into expected_count, ready_count
  from public.test_runs run
  where run.project_id = p_project_id
    and run.protocol_id = p_protocol_id
    and run.status = 'ready_for_review'
    and exists (
      select 1 from public.test_artifacts artifact where artifact.test_run_id = run.id
    );

  if expected_count = 0 or ready_count <> expected_count then
    raise exception 'Findings requires a complete Artifact-backed TestRun matrix';
  end if;

  select * into latest
  from public.experience_findings
  where project_id = p_project_id
    and protocol_id = p_protocol_id
    and input_signature = btrim(p_input_signature)
  order by version desc
  limit 1;

  if latest.status = 'completed' then return latest.id; end if;
  if latest.status in ('pending', 'running') then
    raise exception 'A Findings run is already active for this evidence snapshot';
  end if;

  select coalesce(max(version), 0) + 1 into next_version
  from public.experience_findings
  where project_id = p_project_id and protocol_id = p_protocol_id;

  insert into public.experience_findings (
    project_id, protocol_id, version, status, input_snapshot, input_signature
  ) values (
    p_project_id, p_protocol_id, next_version, 'pending', p_input_snapshot, btrim(p_input_signature)
  ) returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.start_experience_findings(
  p_findings_id uuid,
  p_provider text,
  p_model text,
  p_prompt_version text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_provider not in ('zhipu', 'deepseek')
    or char_length(btrim(coalesce(p_model, ''))) = 0
    or char_length(btrim(coalesce(p_prompt_version, ''))) = 0 then
    raise exception 'Findings route metadata is invalid';
  end if;

  update public.experience_findings
  set status = 'running',
      provider = p_provider,
      model = btrim(p_model),
      prompt_version = btrim(p_prompt_version),
      started_at = now(),
      error_message = null,
      updated_at = now()
  where id = p_findings_id and status = 'pending';

  if not found then raise exception 'Findings is not pending'; end if;
end;
$$;

create or replace function public.complete_experience_findings(
  p_findings_id uuid,
  p_output jsonb,
  p_usage jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_output is null or jsonb_typeof(p_output) <> 'object'
    or p_usage is null or jsonb_typeof(p_usage) <> 'object' then
    raise exception 'Findings output is invalid';
  end if;

  update public.experience_findings
  set status = 'completed',
      output = p_output,
      input_tokens = nullif(p_usage->>'inputTokens', '')::bigint,
      output_tokens = nullif(p_usage->>'outputTokens', '')::bigint,
      latency_ms = nullif(p_usage->>'latencyMs', '')::integer,
      estimated_cost = nullif(p_usage->>'estimatedCost', '')::numeric,
      completed_at = now(),
      updated_at = now()
  where id = p_findings_id and status = 'running';

  if not found then raise exception 'Findings is not running'; end if;
end;
$$;

create or replace function public.confirm_experience_findings(
  p_findings_id uuid,
  p_human_output jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_human_output is null or jsonb_typeof(p_human_output) <> 'object' then
    raise exception 'Confirmed Findings must be a JSON object';
  end if;

  update public.experience_findings
  set human_output = p_human_output,
      human_confirmed_at = now(),
      updated_at = now()
  where id = p_findings_id and status = 'completed';

  if not found then raise exception 'Only completed Findings can be confirmed'; end if;
end;
$$;

create or replace function public.fail_experience_findings(
  p_findings_id uuid,
  p_error_message text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_error text := left(btrim(coalesce(p_error_message, '')), 1000);
begin
  if char_length(safe_error) = 0 then safe_error := 'Findings generation failed'; end if;
  update public.experience_findings
  set status = 'failed', error_message = safe_error, updated_at = now()
  where id = p_findings_id and status in ('pending', 'running');
end;
$$;

alter table public.publish_packs alter column report_id drop not null;
alter table public.publish_packs add column findings_id uuid;
alter table public.publish_packs
  add constraint publish_packs_findings_project_fkey
  foreign key (findings_id, project_id)
  references public.experience_findings(id, project_id)
  on delete restrict;
alter table public.publish_packs
  add constraint publish_packs_exactly_one_source_check
  check (num_nonnulls(report_id, findings_id) = 1);
alter table public.publish_packs
  add constraint publish_packs_findings_version_key unique (findings_id, version);

create or replace function public.begin_findings_publish_pack(
  p_project_id uuid,
  p_findings_id uuid
)
returns uuid
language plpgsql
security definer
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
    and human_confirmed_at is not null;

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
    project_id, report_id, findings_id, version, status, config, content_ideas, selected_idea
  ) values (
    p_project_id, null, p_findings_id, next_version, 'draft',
    coalesce(latest_pack.config, '{}'::jsonb),
    coalesce(latest_pack.content_ideas, '[]'::jsonb),
    latest_pack.selected_idea
  )
  returning id into new_pack_id;

  return new_pack_id;
end;
$$;

create or replace function private.validate_publish_artifact_relation()
returns trigger
language plpgsql
set search_path = ''
as $
begin
  if not exists (
    select 1
    from public.publish_packs pack
    join public.test_artifacts artifact on artifact.id = new.artifact_id
    join public.test_runs run on run.id = artifact.test_run_id
    where pack.id = new.publish_pack_id
      and run.project_id = pack.project_id
      and artifact.kind = 'image'
      and (
        (pack.report_id is not null and exists (
          select 1
          from public.reports report
          join public.result_analyses analysis on analysis.id = report.result_analysis_id
          where report.id = pack.report_id
            and analysis.protocol_id = run.protocol_id
        ))
        or
        (pack.findings_id is not null and exists (
          select 1
          from public.experience_findings finding
          where finding.id = pack.findings_id
            and finding.project_id = pack.project_id
            and finding.protocol_id = run.protocol_id
            and finding.status = 'completed'
            and finding.human_confirmed_at is not null
        ))
      )
  ) then
    raise exception 'Publish screenshot must reference an image TestArtifact from its source Protocol';
  end if;
  return new;
end;
$;

-- Keep text-only Publish support while making project status source-aware.
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
  set status = 'ready',
      community_post = p_community_post,
      input_tokens = nullif(p_usage->>'inputTokens', '')::bigint,
      output_tokens = nullif(p_usage->>'outputTokens', '')::bigint,
      latency_ms = nullif(p_usage->>'latencyMs', '')::integer,
      estimated_cost = nullif(p_usage->>'estimatedCost', '')::numeric,
      updated_at = now()
  where id = target_pack.id;

  update public.projects
  set status = case
        when target_pack.report_id is not null and status = 'reported' then 'published'
        else status
      end,
      updated_at = now()
  where id = target_pack.project_id;
end;
$$;

revoke all on function public.begin_experience_findings(uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.start_experience_findings(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.complete_experience_findings(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.confirm_experience_findings(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.fail_experience_findings(uuid, text) from public, anon, authenticated;
revoke all on function public.begin_findings_publish_pack(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_publish_pack(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;

grant execute on function public.begin_experience_findings(uuid, uuid, jsonb, text) to service_role;
grant execute on function public.start_experience_findings(uuid, text, text, text) to service_role;
grant execute on function public.complete_experience_findings(uuid, jsonb, jsonb) to service_role;
grant execute on function public.confirm_experience_findings(uuid, jsonb) to service_role;
grant execute on function public.fail_experience_findings(uuid, text) to service_role;
grant execute on function public.begin_findings_publish_pack(uuid, uuid) to service_role;
grant execute on function public.complete_publish_pack(uuid, jsonb, jsonb, jsonb) to service_role;
