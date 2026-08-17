-- M8 AI Judge lifecycle. Blind mappings are consumed only inside trusted
-- database functions and are never returned to the application projection.

create function public.begin_judge_run(
  p_project_id uuid,
  p_protocol_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_run_id uuid;
  latest_run_id uuid;
  latest_run_status text;
  next_attempt integer;
  product_count integer;
  test_case_count integer;
  expected_run_count integer;
  ready_run_count integer;
  input_snapshot jsonb;
  input_signature text;
begin
  perform 1
  from public.projects
  where id = p_project_id
    and deleted_at is null
    and status = 'reviewing'
  for update;
  if not found then
    raise exception 'AI Judge requires a project in reviewing state';
  end if;

  if not exists (
    select 1
    from public.protocols protocol
    where protocol.id = p_protocol_id
      and protocol.project_id = p_project_id
      and protocol.status = 'locked'
      and protocol.version = (
        select max(candidate.version)
        from public.protocols candidate
        where candidate.project_id = p_project_id
      )
  ) then
    raise exception 'AI Judge requires the current latest locked Protocol';
  end if;

  if exists (
    select 1
    from public.project_products project_product
    join public.products product on product.id = project_product.product_id
    join public.protocols protocol on protocol.id = p_protocol_id
    where project_product.project_id = p_project_id
      and char_length(btrim(product.name)) >= 3
      and (
        lower(protocol.title || ' ' || protocol.goal || ' ' || protocol.rules::text) like '%' || lower(btrim(product.name)) || '%'
        or exists (
          select 1 from public.test_cases test_case
          where test_case.protocol_id = p_protocol_id
            and lower(test_case.title || ' ' || test_case.objective || ' ' || test_case.prompt || ' ' || coalesce(test_case.input_description, '') || ' ' || test_case.input_artifacts::text || ' ' || test_case.observation_focus::text || ' ' || test_case.execution_rules::text)
              like '%' || lower(btrim(product.name)) || '%'
        )
        or exists (
          select 1 from public.rubric_dimensions rubric
          where rubric.protocol_id = p_protocol_id
            and lower(rubric.name || ' ' || coalesce(rubric.description, '') || ' ' || rubric.scoring_standard::text)
              like '%' || lower(btrim(product.name)) || '%'
        )
      )
  ) then
    raise exception 'Locked Protocol contains product identity and is unsafe for Blind Judge';
  end if;

  select id, status into latest_run_id, latest_run_status
  from public.judge_runs
  where protocol_id = p_protocol_id
  order by attempt desc
  limit 1;
  if latest_run_status = 'completed' then
    return latest_run_id;
  end if;
  if latest_run_status in ('pending', 'running') then
    raise exception 'An AI Judge run is already active';
  end if;

  select count(*) into product_count
  from public.project_products
  where project_id = p_project_id;
  if product_count < 1 or product_count > 3
    or (select count(*) from public.blind_samples where protocol_id = p_protocol_id) <> product_count
    or (select count(*) from public.blind_mappings where protocol_id = p_protocol_id and project_id = p_project_id) <> product_count then
    raise exception 'AI Judge requires a complete Blind Layer';
  end if;

  select count(*) into test_case_count
  from public.test_cases
  where protocol_id = p_protocol_id;
  expected_run_count := product_count * test_case_count;
  select count(*) into ready_run_count
  from public.test_runs test_run
  where test_run.project_id = p_project_id
    and test_run.protocol_id = p_protocol_id
    and test_run.status = 'ready_for_review'
    and exists (
      select 1 from public.test_artifacts artifact
      where artifact.test_run_id = test_run.id
    );
  if test_case_count = 0 or ready_run_count <> expected_run_count then
    raise exception 'AI Judge requires the complete ready Artifact-backed matrix';
  end if;

  input_snapshot := jsonb_build_object(
    'protocolId', p_protocol_id,
    'samples', (
      select jsonb_agg(jsonb_build_object('id', sample.id, 'label', sample.label) order by sample.label)
      from public.blind_samples sample
      where sample.protocol_id = p_protocol_id
    ),
    'testCases', (
      select jsonb_agg(jsonb_build_object('id', test_case.id, 'position', test_case.position) order by test_case.position)
      from public.test_cases test_case
      where test_case.protocol_id = p_protocol_id
    ),
    'rubricDimensions', (
      select jsonb_agg(jsonb_build_object('id', rubric.id, 'position', rubric.position, 'weight', rubric.weight) order by rubric.position)
      from public.rubric_dimensions rubric
      where rubric.protocol_id = p_protocol_id
    ),
    'artifacts', (
      select jsonb_agg(
        jsonb_build_object(
          'blindSampleId', mapping.blind_sample_id,
          'testCaseId', test_run.test_case_id,
          'artifactId', artifact.id,
          'mimeType', artifact.mime_type,
          'sizeBytes', artifact.size_bytes,
          'sha256', artifact.sha256
        )
        order by sample.label, test_case.position, artifact.created_at, artifact.id
      )
      from public.blind_mappings mapping
      join public.blind_samples sample on sample.id = mapping.blind_sample_id
      join public.test_runs test_run
        on test_run.project_id = mapping.project_id
        and test_run.protocol_id = mapping.protocol_id
        and test_run.product_id = mapping.product_id
      join public.test_cases test_case on test_case.id = test_run.test_case_id
      join public.test_artifacts artifact on artifact.test_run_id = test_run.id
      where mapping.project_id = p_project_id
        and mapping.protocol_id = p_protocol_id
    )
  );
  input_signature := encode(extensions.digest(input_snapshot::text, 'sha256'), 'hex');
  select coalesce(max(attempt), 0) + 1 into next_attempt
  from public.judge_runs
  where protocol_id = p_protocol_id;

  insert into public.judge_runs (
    project_id,
    protocol_id,
    attempt,
    status,
    model,
    prompt_version,
    input_snapshot,
    input_signature
  ) values (
    p_project_id,
    p_protocol_id,
    next_attempt,
    'pending',
    'case-routed',
    'judge.v1',
    input_snapshot,
    input_signature
  ) returning id into new_run_id;

  insert into public.judge_run_artifacts (judge_run_id, artifact_id)
  select new_run_id, artifact.id
  from public.test_runs test_run
  join public.test_artifacts artifact on artifact.test_run_id = test_run.id
  where test_run.project_id = p_project_id
    and test_run.protocol_id = p_protocol_id;

  update public.judge_runs
  set status = 'running', started_at = now(), updated_at = now()
  where id = new_run_id;

  return new_run_id;
end;
$$;

create function public.begin_judge_case_run(
  p_judge_run_id uuid,
  p_test_case_id uuid,
  p_provider text,
  p_model text,
  p_prompt_version text,
  p_input_signature text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_protocol_id uuid;
  new_case_run_id uuid;
begin
  select judge_run.protocol_id into run_protocol_id
  from public.judge_runs judge_run
  where judge_run.id = p_judge_run_id and judge_run.status = 'running'
  for update;
  if run_protocol_id is null then
    raise exception 'JudgeCaseRun requires a running JudgeRun';
  end if;
  if p_provider not in ('zhipu', 'deepseek')
    or char_length(btrim(p_model)) = 0
    or char_length(btrim(p_prompt_version)) = 0
    or char_length(btrim(p_input_signature)) = 0 then
    raise exception 'JudgeCaseRun route metadata is invalid';
  end if;
  if not exists (
    select 1 from public.test_cases
    where id = p_test_case_id and protocol_id = run_protocol_id
  ) then
    raise exception 'TestCase does not belong to this JudgeRun Protocol';
  end if;

  insert into public.judge_case_runs (
    judge_run_id,
    protocol_id,
    test_case_id,
    status,
    provider,
    model,
    prompt_version,
    input_signature
  ) values (
    p_judge_run_id,
    run_protocol_id,
    p_test_case_id,
    'pending',
    p_provider,
    btrim(p_model),
    btrim(p_prompt_version),
    btrim(p_input_signature)
  ) returning id into new_case_run_id;

  update public.judge_case_runs
  set status = 'running', started_at = now(), updated_at = now()
  where id = new_case_run_id;
  return new_case_run_id;
end;
$$;

create function public.get_judge_case_inputs(
  p_judge_run_id uuid,
  p_test_case_id uuid
)
returns table (
  blind_sample_id uuid,
  sample_label text,
  artifact_id uuid,
  artifact_kind text,
  mime_type text,
  storage_path text,
  file_name text,
  size_bytes bigint,
  sha256 text
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  run_project_id uuid;
  run_protocol_id uuid;
begin
  select project_id, protocol_id into run_project_id, run_protocol_id
  from public.judge_runs
  where id = p_judge_run_id and status = 'running';
  if run_project_id is null then
    raise exception 'Judge inputs require a running JudgeRun';
  end if;
  if not exists (
    select 1 from public.test_cases
    where id = p_test_case_id and protocol_id = run_protocol_id
  ) then
    raise exception 'TestCase does not belong to this JudgeRun';
  end if;

  return query
  select
    mapping.blind_sample_id,
    sample.label,
    artifact.id,
    artifact.kind,
    artifact.mime_type,
    artifact.storage_path,
    artifact.file_name,
    artifact.size_bytes,
    artifact.sha256
  from public.blind_mappings mapping
  join public.blind_samples sample on sample.id = mapping.blind_sample_id
  join public.test_runs test_run
    on test_run.project_id = mapping.project_id
    and test_run.protocol_id = mapping.protocol_id
    and test_run.product_id = mapping.product_id
    and test_run.test_case_id = p_test_case_id
  join public.test_artifacts artifact on artifact.test_run_id = test_run.id
  join public.judge_run_artifacts run_artifact
    on run_artifact.judge_run_id = p_judge_run_id
    and run_artifact.artifact_id = artifact.id
  where mapping.project_id = run_project_id
    and mapping.protocol_id = run_protocol_id
  order by sample.label, artifact.created_at, artifact.id;
end;
$$;

create function public.complete_judge_case_run(
  p_judge_case_run_id uuid,
  p_scores jsonb,
  p_usage jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_case_run public.judge_case_runs%rowtype;
  expected_score_count integer;
  actual_score_count integer;
  distinct_score_count integer;
begin
  select * into current_case_run
  from public.judge_case_runs
  where id = p_judge_case_run_id and status = 'running'
  for update;
  if current_case_run.id is null then
    raise exception 'JudgeCaseRun is not running';
  end if;
  if jsonb_typeof(p_scores) <> 'array' or jsonb_array_length(p_scores) = 0 then
    raise exception 'JudgeCaseRun scores must be a non-empty array';
  end if;
  select
    (select count(*) from public.blind_samples where protocol_id = current_case_run.protocol_id)
    * (select count(*) from public.rubric_dimensions where protocol_id = current_case_run.protocol_id)
    into expected_score_count;
  actual_score_count := jsonb_array_length(p_scores);
  if actual_score_count <> expected_score_count then
    raise exception 'JudgeCaseRun score matrix is incomplete';
  end if;

  select count(*) into distinct_score_count
  from (
    select distinct
      score->>'blindSampleId' as blind_sample_id,
      score->>'rubricDimensionId' as rubric_dimension_id
    from jsonb_array_elements(p_scores) score
  ) unique_scores;
  if distinct_score_count <> expected_score_count then
    raise exception 'JudgeCaseRun score matrix contains duplicates';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_scores) score
    where not exists (
      select 1 from public.blind_samples sample
      where sample.id = (score->>'blindSampleId')::uuid
        and sample.protocol_id = current_case_run.protocol_id
    )
    or not exists (
      select 1 from public.rubric_dimensions rubric
      where rubric.id = (score->>'rubricDimensionId')::uuid
        and rubric.protocol_id = current_case_run.protocol_id
    )
    or (score->>'aiScore')::numeric < 0
    or (score->>'aiScore')::numeric > 10
    or (score->>'aiScore')::numeric * 10 <> trunc((score->>'aiScore')::numeric * 10)
    or char_length(btrim(coalesce(score->>'reason', ''))) = 0
    or jsonb_typeof(score->'evidence') <> 'array'
    or jsonb_array_length(score->'evidence') = 0
    or (score->>'confidence')::numeric < 0
    or (score->>'confidence')::numeric > 1
  ) then
    raise exception 'JudgeCaseRun score payload is invalid';
  end if;

  insert into public.judge_scores (
    judge_run_id,
    judge_case_run_id,
    protocol_id,
    test_case_id,
    blind_sample_id,
    rubric_dimension_id,
    ai_score,
    reason,
    evidence,
    confidence,
    model,
    prompt_version
  )
  select
    current_case_run.judge_run_id,
    current_case_run.id,
    current_case_run.protocol_id,
    current_case_run.test_case_id,
    (score->>'blindSampleId')::uuid,
    (score->>'rubricDimensionId')::uuid,
    (score->>'aiScore')::numeric,
    btrim(score->>'reason'),
    score->'evidence',
    (score->>'confidence')::numeric,
    current_case_run.model,
    current_case_run.prompt_version
  from jsonb_array_elements(p_scores) score;

  update public.judge_case_runs
  set
    input_tokens = nullif(p_usage->>'inputTokens', '')::bigint,
    output_tokens = nullif(p_usage->>'outputTokens', '')::bigint,
    latency_ms = nullif(p_usage->>'latencyMs', '')::integer,
    estimated_cost = nullif(p_usage->>'estimatedCost', '')::numeric,
    status = 'completed',
    updated_at = now()
  where id = current_case_run.id;
end;
$$;

create function public.complete_judge_run(p_judge_run_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.judge_runs
  set status = 'completed', updated_at = now()
  where id = p_judge_run_id and status = 'running';
  if not found then raise exception 'JudgeRun is not running'; end if;
end;
$$;

create function public.fail_judge_run(p_judge_run_id uuid, p_error_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_error text := left(btrim(coalesce(p_error_message, '')), 1000);
begin
  if char_length(safe_error) = 0 then safe_error := 'AI Judge failed'; end if;
  update public.judge_case_runs
  set status = 'failed', error_message = safe_error, updated_at = now()
  where judge_run_id = p_judge_run_id and status in ('pending', 'running');
  update public.judge_runs
  set status = 'failed', error_message = safe_error, updated_at = now()
  where id = p_judge_run_id and status in ('pending', 'running');
end;
$$;

comment on function public.get_judge_case_inputs(uuid, uuid) is
  'Returns Sample-labeled Artifact inputs without exposing product identity or Blind Mapping.';

revoke all on function public.begin_judge_run(uuid, uuid) from public, anon, authenticated;
revoke all on function public.begin_judge_case_run(uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.get_judge_case_inputs(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_judge_case_run(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.complete_judge_run(uuid) from public, anon, authenticated;
revoke all on function public.fail_judge_run(uuid, text) from public, anon, authenticated;

grant execute on function public.begin_judge_run(uuid, uuid) to service_role;
grant execute on function public.begin_judge_case_run(uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.get_judge_case_inputs(uuid, uuid) to service_role;
grant execute on function public.complete_judge_case_run(uuid, jsonb, jsonb) to service_role;
grant execute on function public.complete_judge_run(uuid) to service_role;
grant execute on function public.fail_judge_run(uuid, text) to service_role;
