-- M10 Final Result Analysis. The database binds every analysis attempt to the
-- revealed ReviewSession and its canonical Final Score signature.

create function public.begin_result_analysis(
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

create function public.start_result_analysis(
  p_result_analysis_id uuid,
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
    raise exception 'Result Analysis route metadata is invalid';
  end if;
  update public.result_analyses
  set provider = p_provider,
      model = btrim(p_model),
      prompt_version = btrim(p_prompt_version),
      status = 'running',
      started_at = now(),
      updated_at = now()
  where id = p_result_analysis_id and status = 'pending';
  if not found then raise exception 'Result Analysis is not pending'; end if;
end;
$$;

create function public.complete_result_analysis(
  p_result_analysis_id uuid,
  p_winner_product_id uuid,
  p_output jsonb,
  p_usage jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_analysis public.result_analyses%rowtype;
  expected_winner_product_id uuid;
begin
  select * into target_analysis
  from public.result_analyses
  where id = p_result_analysis_id and status = 'running'
  for update;
  if target_analysis.id is null then raise exception 'Result Analysis is not running'; end if;
  if jsonb_typeof(p_output) <> 'object' then raise exception 'Result Analysis output must be an object'; end if;
  select mapping.product_id into expected_winner_product_id
  from public.blind_mappings mapping
  join public.products product on product.id = mapping.product_id
  where mapping.project_id = target_analysis.project_id
    and mapping.protocol_id = target_analysis.protocol_id
  order by (
    select sum(dimension_score.score * rubric.weight / 100)
    from (
      select final_score.rubric_dimension_id, round(avg(final_score.final_score), 1) as score
      from public.review_final_scores final_score
      where final_score.review_session_id = target_analysis.review_session_id
        and final_score.blind_sample_id = mapping.blind_sample_id
      group by final_score.rubric_dimension_id
    ) dimension_score
    join public.rubric_dimensions rubric on rubric.id = dimension_score.rubric_dimension_id
  ) desc, mapping.product_id
  limit 1;
  if expected_winner_product_id is null or p_winner_product_id <> expected_winner_product_id then
    raise exception 'Winner must match the locked Final Score ranking';
  end if;

  update public.result_analyses
  set winner_product_id = p_winner_product_id,
      output = p_output,
      input_tokens = nullif(p_usage->>'inputTokens', '')::bigint,
      output_tokens = nullif(p_usage->>'outputTokens', '')::bigint,
      latency_ms = nullif(p_usage->>'latencyMs', '')::integer,
      estimated_cost = nullif(p_usage->>'estimatedCost', '')::numeric,
      status = 'completed',
      updated_at = now()
  where id = p_result_analysis_id;
end;
$$;

create function public.fail_result_analysis(
  p_result_analysis_id uuid,
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
  if char_length(safe_error) = 0 then safe_error := 'Final Result Analysis failed'; end if;
  update public.result_analyses
  set status = 'failed', error_message = safe_error, updated_at = now()
  where id = p_result_analysis_id and status in ('pending', 'running');
end;
$$;

revoke all on function public.begin_result_analysis(uuid, uuid) from public, anon, authenticated;
revoke all on function public.start_result_analysis(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.complete_result_analysis(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.fail_result_analysis(uuid, text) from public, anon, authenticated;
grant execute on function public.begin_result_analysis(uuid, uuid) to service_role;
grant execute on function public.start_result_analysis(uuid, text, text, text) to service_role;
grant execute on function public.complete_result_analysis(uuid, uuid, jsonb, jsonb) to service_role;
grant execute on function public.fail_result_analysis(uuid, text) to service_role;
