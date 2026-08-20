-- Support single-product experience Protocols while preserving comparison gating.
-- Carry evidence-aware TestCase metadata into the immutable ResultAnalysis snapshot.

-- Persist evidence-aware TestCase metadata without weakening the existing M5 validation contract.

create or replace function public.create_protocol_draft(
  p_project_id uuid,
  p_research_run_id uuid,
  p_protocol jsonb,
  p_generation_provider text,
  p_generation_model text,
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
  new_protocol_id uuid;
  next_version integer;
  test_case jsonb;
  rubric_dimension jsonb;
  rubric_total numeric := 0;
begin
  perform 1
  from public.projects
  where id = p_project_id
    and deleted_at is null
    and status in ('research_ready', 'protocol_draft', 'protocol_locked')
  for update;
  if not found then
    raise exception 'Project is unavailable for Protocol generation';
  end if;

  if not exists (
    select 1
    from public.research_runs
    where id = p_research_run_id
      and project_id = p_project_id
      and status = 'completed'
      and (
        comparability->>'status' in ('comparable', 'partially_comparable')
        or (select count(*) from public.project_products where project_id = p_project_id) = 1
      )
  ) then
    raise exception 'Protocol requires the selected completed and comparable ResearchRun';
  end if;

  if p_protocol is null or jsonb_typeof(p_protocol) <> 'object'
    or jsonb_typeof(p_protocol->'rules') <> 'array'
    or jsonb_typeof(p_protocol->'testCases') <> 'array'
    or jsonb_typeof(p_protocol->'rubric') <> 'array' then
    raise exception 'Protocol payload must contain rules, testCases, and rubric arrays';
  end if;
  if char_length(btrim(coalesce(p_protocol->>'title', ''))) = 0
    or char_length(btrim(coalesce(p_protocol->>'goal', ''))) = 0 then
    raise exception 'Protocol title and goal are required';
  end if;
  if p_protocol->>'testMode' <> 'standardized' then
    raise exception 'MVP Protocol test mode must be standardized';
  end if;
  if jsonb_array_length(p_protocol->'rules') < 5
    or jsonb_array_length(p_protocol->'testCases') < 1
    or jsonb_array_length(p_protocol->'rubric') < 1 then
    raise exception 'Protocol rules, TestCases, and Rubric cannot be empty';
  end if;

  if p_generation_provider not in ('zhipu', 'deepseek')
    or char_length(btrim(coalesce(p_generation_model, ''))) = 0
    or char_length(btrim(coalesce(p_prompt_version, ''))) = 0
    or char_length(btrim(coalesce(p_input_signature, ''))) = 0 then
    raise exception 'Valid Protocol generation route metadata is required';
  end if;
  if p_usage is null or jsonb_typeof(p_usage) <> 'object' then
    raise exception 'Protocol generation usage metadata must be a JSON object';
  end if;

  if (select count(distinct rule->>'id') from jsonb_array_elements(p_protocol->'rules') rule)
      <> jsonb_array_length(p_protocol->'rules')
    or not ((p_protocol->'rules') @> '[{"id":"same-input"},{"id":"same-prompt"},{"id":"single-generation"},{"id":"no-editing"},{"id":"complete-upload"}]'::jsonb) then
    raise exception 'Protocol must preserve every mandatory standardized test rule exactly once';
  end if;

  if (select count(distinct item->>'title') from jsonb_array_elements(p_protocol->'testCases') item)
      <> jsonb_array_length(p_protocol->'testCases') then
    raise exception 'TestCase titles must be unique';
  end if;
  if (select count(distinct item->>'name') from jsonb_array_elements(p_protocol->'rubric') item)
      <> jsonb_array_length(p_protocol->'rubric') then
    raise exception 'Rubric dimension names must be unique';
  end if;

  for rubric_dimension in select value from jsonb_array_elements(p_protocol->'rubric') loop
    if char_length(btrim(coalesce(rubric_dimension->>'name', ''))) = 0
      or jsonb_typeof(rubric_dimension->'weight') <> 'number'
      or (rubric_dimension->>'weight')::numeric <= 0
      or (rubric_dimension->>'weight')::numeric > 100
      or jsonb_typeof(rubric_dimension->'scoringStandard') <> 'object' then
      raise exception 'Every Rubric dimension needs a valid name, weight, and scoring standard';
    end if;
    rubric_total := rubric_total + (rubric_dimension->>'weight')::numeric;
  end loop;
  if rubric_total <> 100 then
    raise exception 'Rubric weights must total exactly 100';
  end if;

  select coalesce(max(version), 0) + 1 into next_version
  from public.protocols
  where project_id = p_project_id;

  insert into public.protocols (
    project_id,
    research_run_id,
    version,
    title,
    goal,
    status,
    test_mode,
    rules,
    generation_provider,
    generation_model,
    prompt_version,
    input_signature,
    generation_input_tokens,
    generation_output_tokens,
    generation_latency_ms,
    generation_estimated_cost
  ) values (
    p_project_id,
    p_research_run_id,
    next_version,
    btrim(p_protocol->>'title'),
    btrim(p_protocol->>'goal'),
    'draft',
    'standardized',
    p_protocol->'rules',
    p_generation_provider,
    btrim(p_generation_model),
    btrim(p_prompt_version),
    btrim(p_input_signature),
    (p_usage->>'inputTokens')::bigint,
    (p_usage->>'outputTokens')::bigint,
    (p_usage->>'latencyMs')::integer,
    (p_usage->>'estimatedCost')::numeric
  ) returning id into new_protocol_id;

  for test_case in select value from jsonb_array_elements(p_protocol->'testCases') loop
    if char_length(btrim(coalesce(test_case->>'title', ''))) = 0
      or char_length(btrim(coalesce(test_case->>'objective', ''))) = 0
      or char_length(btrim(coalesce(test_case->>'prompt', ''))) = 0
      or jsonb_typeof(test_case->'inputArtifacts') <> 'array'
      or jsonb_typeof(test_case->'expectedOutputTypes') <> 'array'
      or jsonb_array_length(test_case->'expectedOutputTypes') < 1
      or jsonb_typeof(test_case->'evidenceRequirements') <> 'array'
      or jsonb_array_length(test_case->'evidenceRequirements') < 1
      or jsonb_typeof(test_case->'observationFocus') <> 'array'
      or jsonb_typeof(test_case->'executionRules') <> 'array' then
      raise exception 'Every TestCase needs a title, objective, Prompt, output types, evidence requirements, and valid detail arrays';
    end if;

    if exists (
      select 1
      from jsonb_array_elements_text(test_case->'expectedOutputTypes') output_type
      where output_type not in ('text', 'image', 'document', 'video', 'code', 'mixed')
    ) then
      raise exception 'TestCase contains an unsupported expected output type';
    end if;

    insert into public.test_cases (
      protocol_id,
      position,
      title,
      objective,
      prompt,
      input_description,
      input_artifacts,
      expected_output_types,
      evidence_requirements,
      observation_focus,
      execution_rules
    ) values (
      new_protocol_id,
      (test_case->>'position')::smallint,
      btrim(test_case->>'title'),
      btrim(test_case->>'objective'),
      btrim(test_case->>'prompt'),
      nullif(btrim(coalesce(test_case->>'inputDescription', '')), ''),
      test_case->'inputArtifacts',
      test_case->'expectedOutputTypes',
      test_case->'evidenceRequirements',
      test_case->'observationFocus',
      test_case->'executionRules'
    );
  end loop;

  for rubric_dimension in select value from jsonb_array_elements(p_protocol->'rubric') loop
    insert into public.rubric_dimensions (
      protocol_id,
      position,
      name,
      weight,
      description,
      scoring_standard
    ) values (
      new_protocol_id,
      (rubric_dimension->>'position')::smallint,
      btrim(rubric_dimension->>'name'),
      (rubric_dimension->>'weight')::numeric,
      nullif(btrim(coalesce(rubric_dimension->>'description', '')), ''),
      rubric_dimension->'scoringStandard'
    );
  end loop;

  update public.projects
  set status = 'protocol_draft', updated_at = now()
  where id = p_project_id;

  return new_protocol_id;
end;
$$;

revoke all on function public.create_protocol_draft(uuid, uuid, jsonb, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_protocol_draft(uuid, uuid, jsonb, text, text, text, text, jsonb) to service_role;

create or replace function public.begin_result_analysis(
  p_project_id uuid,
  p_review_session_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_session public.review_sessions%rowtype;
  current_signature text;
  latest_analysis_id uuid;
  latest_analysis_status text;
  next_attempt integer;
  snapshot jsonb;
  new_analysis_id uuid;
begin
  perform 1 from public.projects
  where id = p_project_id and status = 'completed' and deleted_at is null
  for update;
  if not found then
    raise exception 'Final Result Analysis requires a completed revealed project';
  end if;

  select * into target_session
  from public.review_sessions
  where id = p_review_session_id
    and project_id = p_project_id
    and status = 'revealed';
  if target_session.id is null then
    raise exception 'Final Result Analysis requires a revealed ReviewSession';
  end if;
  current_signature := private.final_score_signature(target_session.id);

  select id, status into latest_analysis_id, latest_analysis_status
  from public.result_analyses
  where review_session_id = target_session.id
    and final_score_signature = current_signature
  order by attempt desc
  limit 1;
  if latest_analysis_status = 'completed' then return latest_analysis_id; end if;
  if latest_analysis_status in ('pending', 'running') then
    raise exception 'A Final Result Analysis run is already active';
  end if;

  snapshot := jsonb_build_object(
    'project', (
      select jsonb_build_object('id', project.id, 'name', project.name, 'intent', project.intent)
      from public.projects project where project.id = p_project_id
    ),
    'review', jsonb_build_object(
      'reviewSessionId', target_session.id,
      'judgeRunId', target_session.judge_run_id,
      'finalScoreSignature', current_signature,
      'adjustmentCount', (
        select count(*) from public.review_final_scores
        where review_session_id = target_session.id and active_override_event_id is not null
      )
    ),
    'protocol', (
      select jsonb_build_object(
        'id', protocol.id,
        'version', protocol.version,
        'title', protocol.title,
        'goal', protocol.goal,
        'testMode', protocol.test_mode,
        'rules', protocol.rules,
        'testCases', (
          select jsonb_agg(jsonb_build_object(
            'id', test_case.id,
            'position', test_case.position,
            'title', test_case.title,
            'objective', test_case.objective,
            'prompt', test_case.prompt,
            'expectedOutputTypes', test_case.expected_output_types,
            'evidenceRequirements', test_case.evidence_requirements,
            'observationFocus', test_case.observation_focus
          ) order by test_case.position)
          from public.test_cases test_case where test_case.protocol_id = protocol.id
        ),
        'rubric', (
          select jsonb_agg(jsonb_build_object(
            'id', rubric.id,
            'position', rubric.position,
            'name', rubric.name,
            'weight', rubric.weight,
            'description', rubric.description,
            'scoringStandard', rubric.scoring_standard
          ) order by rubric.position)
          from public.rubric_dimensions rubric where rubric.protocol_id = protocol.id
        )
      )
      from public.protocols protocol where protocol.id = target_session.protocol_id
    ),
    'products', (
      select jsonb_agg(jsonb_build_object(
        'productId', mapping.product_id,
        'productName', product.name,
        'sampleId', mapping.blind_sample_id,
        'scores', (
          select jsonb_agg(jsonb_build_object(
            'judgeScoreId', final_score.judge_score_id,
            'testCaseId', final_score.test_case_id,
            'rubricDimensionId', final_score.rubric_dimension_id,
            'aiScore', final_score.ai_score,
            'finalScore', final_score.final_score,
            'reason', judge_score.reason,
            'evidence', judge_score.evidence,
            'confidence', judge_score.confidence,
            'humanOverrideReason', review_event.reason
          ) order by test_case.position, rubric.position)
          from public.review_final_scores final_score
          join public.judge_scores judge_score on judge_score.id = final_score.judge_score_id
          join public.test_cases test_case on test_case.id = final_score.test_case_id
          join public.rubric_dimensions rubric on rubric.id = final_score.rubric_dimension_id
          left join public.human_review_events review_event on review_event.id = final_score.active_override_event_id
          where final_score.review_session_id = target_session.id
            and final_score.blind_sample_id = mapping.blind_sample_id
        ),
        'artifacts', (
          select jsonb_agg(jsonb_build_object(
            'artifactId', artifact.id,
            'testCaseId', test_run.test_case_id,
            'kind', artifact.kind,
            'mimeType', artifact.mime_type,
            'fileName', artifact.file_name,
            'sizeBytes', artifact.size_bytes,
            'sha256', artifact.sha256,
            'generationTimeSeconds', test_run.generation_time_seconds,
            'retryCount', test_run.retry_count,
            'manuallyEdited', test_run.manually_edited,
            'notes', test_run.notes
          ) order by test_case.position, artifact.created_at, artifact.id)
          from public.test_runs test_run
          join public.test_cases test_case on test_case.id = test_run.test_case_id
          join public.test_artifacts artifact on artifact.test_run_id = test_run.id
          where test_run.project_id = p_project_id
            and test_run.protocol_id = target_session.protocol_id
            and test_run.product_id = mapping.product_id
        )
      ) order by project_product.display_order)
      from public.blind_mappings mapping
      join public.products product on product.id = mapping.product_id
      join public.project_products project_product
        on project_product.project_id = mapping.project_id
        and project_product.product_id = mapping.product_id
      where mapping.project_id = p_project_id
        and mapping.protocol_id = target_session.protocol_id
    )
  );

  select coalesce(max(attempt), 0) + 1 into next_attempt
  from public.result_analyses
  where review_session_id = target_session.id
    and final_score_signature = current_signature;
  insert into public.result_analyses (
    project_id,
    protocol_id,
    review_session_id,
    judge_run_id,
    attempt,
    status,
    final_score_signature,
    input_snapshot
  ) values (
    p_project_id,
    target_session.protocol_id,
    target_session.id,
    target_session.judge_run_id,
    next_attempt,
    'pending',
    current_signature,
    snapshot
  ) returning id into new_analysis_id;
  return new_analysis_id;
end;
$$;
