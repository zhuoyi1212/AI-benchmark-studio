-- Start a replacement upload round without mutating any original evidence.
alter table public.protocols add column retest_of_protocol_id uuid
  references public.protocols(id) on delete restrict;
create index protocols_retest_source_idx on public.protocols(retest_of_protocol_id)
  where retest_of_protocol_id is not null;

create function public.restart_test_execution(p_project_id uuid, p_protocol_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  source public.protocols%rowtype;
  latest public.protocols%rowtype;
  replacement uuid;
begin
  -- Same project-level mutex as worker claims. Never replace live AI inputs.
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text, 0));
  perform 1 from public.projects where id = p_project_id and deleted_at is null for update;
  if not found then raise exception using errcode = 'P2100', message = 'Project unavailable'; end if;
  select * into source from public.protocols where id = p_protocol_id and project_id = p_project_id;
  if source.id is null or source.status <> 'locked' then
    raise exception using errcode = 'P2100', message = 'A locked source Protocol is required';
  end if;
  select * into latest from public.protocols where project_id = p_project_id order by version desc limit 1;
  if latest.id <> source.id then
    -- Lost responses / double submits return the same untouched replacement.
    if latest.retest_of_protocol_id = source.id and latest.status = 'locked'
      and not exists (select 1 from public.test_runs r join public.test_artifacts a on a.test_run_id = r.id where r.protocol_id = latest.id)
      and not exists (select 1 from public.judge_runs where protocol_id = latest.id) then
      return latest.id;
    end if;
    raise exception using errcode = 'P2101', message = 'Protocol changed; refresh before replacing uploads';
  end if;
  if exists (select 1 from public.quick_jobs where project_id = p_project_id and status in ('queued','running'))
    or exists (select 1 from public.judge_runs where project_id = p_project_id and status in ('pending','running'))
    or exists (select 1 from public.experience_findings where project_id = p_project_id and status in ('pending','running'))
    or exists (select 1 from public.result_analyses where project_id = p_project_id and status in ('pending','running'))
    or exists (select 1 from public.reports where project_id = p_project_id and status in ('pending','running'))
    or exists (select 1 from public.publish_packs where project_id = p_project_id and status in ('discovering','generating')) then
    raise exception using errcode = 'P2102', message = 'Wait for active processing before replacing uploads';
  end if;
  if not exists (select 1 from public.test_runs r join public.test_artifacts a on a.test_run_id = r.id where r.protocol_id = source.id) then
    raise exception using errcode = 'P2103', message = 'There are no uploaded files to replace';
  end if;

  insert into public.protocols(project_id,research_run_id,version,title,goal,status,test_mode,rules,
    generation_provider,generation_model,prompt_version,input_signature,
    generation_input_tokens,generation_output_tokens,generation_latency_ms,generation_estimated_cost,retest_of_protocol_id)
  values(p_project_id,source.research_run_id,source.version+1,source.title,source.goal,'draft',source.test_mode,source.rules,
    source.generation_provider,source.generation_model,source.prompt_version,source.input_signature,0,0,0,0,source.id)
  returning id into replacement;
  insert into public.test_cases(protocol_id,position,title,objective,prompt,input_description,input_artifacts,
    expected_output_types,evidence_requirements,observation_focus,execution_rules)
  select replacement,position,title,objective,prompt,input_description,input_artifacts,
    expected_output_types,evidence_requirements,observation_focus,execution_rules from public.test_cases where protocol_id = source.id;
  insert into public.rubric_dimensions(protocol_id,position,name,weight,description,scoring_standard)
  select replacement,position,name,weight,description,scoring_standard from public.rubric_dimensions where protocol_id = source.id;
  perform public.lock_protocol(replacement);
  perform public.ensure_test_run_matrix(p_project_id, replacement);
  return replacement;
end;
$$;
revoke all on function public.restart_test_execution(uuid,uuid) from public,anon,authenticated;
grant execute on function public.restart_test_execution(uuid,uuid) to service_role;
comment on column public.protocols.retest_of_protocol_id is 'Exact locked-task copy for a new upload/analysis round; all source evidence and derived history remain immutable.';

-- Collapse the cross-stage navigation status into one server-side read.
-- The function exposes no client capability: only the service role may execute it.
create or replace function public.get_workflow_navigation_snapshot(p_project_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'projectId', p.id,
    'evaluationMode', p.evaluation_mode,
    'productCount', (
      select count(*) from public.project_products pp where pp.project_id = p.id
    ),
    'researchRuns', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'version', r.version,
          'status', r.status,
          'comparability', r.comparability
        ) order by r.version desc
      )
      from public.research_runs r
      where r.project_id = p.id
    ), '[]'::jsonb),
    'protocols', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', protocol.id,
          'researchRunId', protocol.research_run_id,
          'version', protocol.version,
          'status', protocol.status,
          'retestOfProtocolId', protocol.retest_of_protocol_id
        ) order by protocol.version desc
      )
      from public.protocols protocol
      where protocol.project_id = p.id
    ), '[]'::jsonb),
    'testCases', coalesce((
      select jsonb_agg(jsonb_build_object('id', test_case.id, 'protocolId', test_case.protocol_id))
      from public.test_cases test_case
      join public.protocols protocol on protocol.id = test_case.protocol_id
      where protocol.project_id = p.id
    ), '[]'::jsonb),
    'testRuns', coalesce((
      select jsonb_agg(jsonb_build_object('id', test_run.id, 'protocolId', test_run.protocol_id, 'status', test_run.status))
      from public.test_runs test_run
      where test_run.project_id = p.id
    ), '[]'::jsonb),
    'artifactRunIds', coalesce((
      select jsonb_agg(distinct artifact.test_run_id)
      from public.test_artifacts artifact
      join public.test_runs test_run on test_run.id = artifact.test_run_id
      where test_run.project_id = p.id
    ), '[]'::jsonb),
    'judgeRuns', coalesce((
      select jsonb_agg(jsonb_build_object('id', judge.id, 'protocolId', judge.protocol_id, 'status', judge.status))
      from public.judge_runs judge
      where judge.project_id = p.id
    ), '[]'::jsonb),
    'reviewSessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', review.id,
        'protocolId', review.protocol_id,
        'judgeRunId', review.judge_run_id,
        'status', review.status
      ))
      from public.review_sessions review
      where review.project_id = p.id
    ), '[]'::jsonb),
    'experienceFindings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', finding.id,
        'protocolId', finding.protocol_id,
        'status', finding.status,
        'humanConfirmedAt', finding.human_confirmed_at
      ))
      from public.experience_findings finding
      where finding.project_id = p.id
    ), '[]'::jsonb),
    'resultAnalyses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', analysis.id,
        'reviewSessionId', analysis.review_session_id,
        'status', analysis.status
      ))
      from public.result_analyses analysis
      where analysis.project_id = p.id
    ), '[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', report.id,
        'resultAnalysisId', report.result_analysis_id,
        'status', report.status
      ))
      from public.reports report
      where report.project_id = p.id
    ), '[]'::jsonb),
    'publishPacks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pack.id,
        'reportId', pack.report_id,
        'findingsId', pack.findings_id,
        'status', pack.status
      ))
      from public.publish_packs pack
      where pack.project_id = p.id
    ), '[]'::jsonb)
  )
  from public.projects p
  where p.id = p_project_id and p.deleted_at is null;
$$;

revoke all on function public.get_workflow_navigation_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.get_workflow_navigation_snapshot(uuid) to service_role;
