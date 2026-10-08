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
          'status', protocol.status
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
