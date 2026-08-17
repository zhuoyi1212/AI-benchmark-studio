-- M11 Report lifecycle. A Report is an immutable expression layer over one
-- current completed Final Result Analysis and its real TestArtifact evidence.

alter table public.reports
  add column started_at timestamptz;

create function public.begin_report(
  p_project_id uuid,
  p_result_analysis_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_analysis public.result_analyses%rowtype;
  latest_report_id uuid;
  latest_report_status text;
  next_version integer;
  new_report_id uuid;
  evidence_count integer;
begin
  perform 1 from public.projects
  where id = p_project_id
    and status in ('completed', 'reported', 'published')
    and deleted_at is null
  for update;
  if not found then raise exception 'Report requires an active completed project'; end if;

  select * into target_analysis
  from public.result_analyses
  where id = p_result_analysis_id
    and project_id = p_project_id
    and status = 'completed';
  if target_analysis.id is null then raise exception 'Report requires a completed Final Result Analysis'; end if;
  if target_analysis.final_score_signature <> private.final_score_signature(target_analysis.review_session_id) then
    raise exception 'Report source analysis is stale';
  end if;

  select id, status into latest_report_id, latest_report_status
  from public.reports
  where result_analysis_id = target_analysis.id
  order by version desc
  limit 1;
  if latest_report_status = 'completed' then return latest_report_id; end if;
  if latest_report_status in ('pending', 'running') then
    raise exception 'A Report generation run is already active';
  end if;

  select coalesce(max(version), 0) + 1 into next_version
  from public.reports where result_analysis_id = target_analysis.id;
  insert into public.reports (project_id, result_analysis_id, version, status)
  values (p_project_id, target_analysis.id, next_version, 'pending')
  returning id into new_report_id;

  insert into public.report_artifacts (report_id, artifact_id, evidence_role, caption)
  select new_report_id,
         artifact.id,
         'case_output',
         test_case.title || ' · ' || product.name
  from public.test_runs test_run
  join public.test_cases test_case on test_case.id = test_run.test_case_id
  join public.products product on product.id = test_run.product_id
  join public.test_artifacts artifact on artifact.test_run_id = test_run.id
  where test_run.project_id = p_project_id
    and test_run.protocol_id = target_analysis.protocol_id
  order by test_case.position, product.name, artifact.created_at, artifact.id;
  get diagnostics evidence_count = row_count;
  if evidence_count = 0 then raise exception 'Report requires real TestArtifact evidence'; end if;
  return new_report_id;
end;
$$;

create function public.start_report(
  p_report_id uuid,
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
    or char_length(btrim(p_model)) = 0
    or char_length(btrim(p_prompt_version)) = 0 then
    raise exception 'Report route metadata is invalid';
  end if;
  update public.reports
  set provider = p_provider,
      model = btrim(p_model),
      prompt_version = btrim(p_prompt_version),
      status = 'running',
      started_at = now(),
      updated_at = now()
  where id = p_report_id and status = 'pending';
  if not found then raise exception 'Report is not pending'; end if;
end;
$$;

create function public.complete_report(
  p_report_id uuid,
  p_content jsonb,
  p_usage jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_report public.reports%rowtype;
begin
  select * into target_report
  from public.reports
  where id = p_report_id and status = 'running'
  for update;
  if target_report.id is null then raise exception 'Report is not running'; end if;
  if jsonb_typeof(p_content) <> 'object' then raise exception 'Report content must be an object'; end if;

  update public.reports
  set content = p_content,
      input_tokens = nullif(p_usage->>'inputTokens', '')::bigint,
      output_tokens = nullif(p_usage->>'outputTokens', '')::bigint,
      latency_ms = nullif(p_usage->>'latencyMs', '')::integer,
      estimated_cost = nullif(p_usage->>'estimatedCost', '')::numeric,
      status = 'completed',
      updated_at = now()
  where id = p_report_id;

  update public.projects
  set status = 'reported', updated_at = now()
  where id = target_report.project_id and status = 'completed';
end;
$$;

create function public.fail_report(
  p_report_id uuid,
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
  if char_length(safe_error) = 0 then safe_error := 'Report generation failed'; end if;
  update public.reports
  set status = 'failed', error_message = safe_error, updated_at = now()
  where id = p_report_id and status in ('pending', 'running');
end;
$$;

revoke all on function public.begin_report(uuid, uuid) from public, anon, authenticated;
revoke all on function public.start_report(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.complete_report(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.fail_report(uuid, text) from public, anon, authenticated;
grant execute on function public.begin_report(uuid, uuid) to service_role;
grant execute on function public.start_report(uuid, text, text, text) to service_role;
grant execute on function public.complete_report(uuid, jsonb, jsonb) to service_role;
grant execute on function public.fail_report(uuid, text) to service_role;
