-- Allow a project to create a new Protocol version after downstream execution has begun.
-- Existing Protocols, TestRuns, Artifacts, and derived records remain immutable history.

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
    and status in (
      'research_ready',
      'protocol_draft',
      'protocol_locked',
      'testing',
      'reviewing',
      'review_locked',
      'completed',
      'reported',
      'published'
    )
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
