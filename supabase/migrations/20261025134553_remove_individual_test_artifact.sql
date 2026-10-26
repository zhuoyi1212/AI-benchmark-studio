-- Removing an upload changes the evidence set, while immutable scores remain auditable.
-- Surviving attachments share the SAME object: no historical binary copies are made.
alter table public.test_artifacts drop constraint test_artifacts_storage_path_key;
alter table public.test_artifacts add constraint test_artifacts_run_storage_key unique(test_run_id,storage_path);
create index test_artifacts_storage_path_idx on public.test_artifacts(storage_path);

create table public.test_artifact_deletions (
  artifact_id uuid primary key references public.test_artifacts(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  protocol_id uuid not null references public.protocols(id) on delete restrict,
  replacement_protocol_id uuid not null references public.protocols(id) on delete restrict,
  storage_path text not null unique,
  preview_path text,
  requested_at timestamptz not null default now(),
  cleaned_at timestamptz
);
create index test_artifact_deletions_pending_idx on public.test_artifact_deletions(project_id) where cleaned_at is null;
alter table public.test_artifact_deletions enable row level security;
revoke all on public.test_artifact_deletions from public,anon,authenticated;
grant select,insert,update on public.test_artifact_deletions to service_role;

create view public.available_test_artifacts with (security_invoker = true) as
select a.* from public.test_artifacts a where not exists (
  select 1 from public.test_artifact_deletions d where d.storage_path = a.storage_path
);
revoke all on public.available_test_artifacts from public,anon,authenticated;
grant select on public.available_test_artifacts to service_role;

create function public.remove_test_artifact(p_project_id uuid,p_protocol_id uuid,p_artifact_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  target public.test_artifacts%rowtype;
  previous public.test_artifact_deletions%rowtype;
  replacement uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text,0));
  perform 1 from public.projects where id=p_project_id and deleted_at is null for update;
  if not found then raise exception using errcode='P2100',message='Project unavailable'; end if;
  -- An interrupted Storage cleanup can be retried even after the new round exists.
  select * into previous from public.test_artifact_deletions
    where artifact_id=p_artifact_id and project_id=p_project_id and protocol_id=p_protocol_id;
  if found then
    return jsonb_build_object('protocolId',previous.replacement_protocol_id,
      'cacheArtifactIds',case when previous.cleaned_at is null then (select coalesce(jsonb_agg(id),'[]'::jsonb) from public.test_artifacts where storage_path=previous.storage_path and kind='video') else '[]'::jsonb end,
      'storagePaths',case when previous.cleaned_at is null then to_jsonb(array_remove(array[previous.storage_path,previous.preview_path],null)) else '[]'::jsonb end);
  end if;
  select a.* into target from public.available_test_artifacts a join public.test_runs r on r.id=a.test_run_id
    where a.id=p_artifact_id and r.project_id=p_project_id and r.protocol_id=p_protocol_id;
  if not found then raise exception using errcode='P2103',message='Upload unavailable'; end if;
  -- Locks the project and rejects stale requests and active AI work.
  replacement := public.restart_test_execution(p_project_id,p_protocol_id);

  insert into public.test_artifact_deletions(artifact_id,project_id,protocol_id,replacement_protocol_id,storage_path,preview_path)
    values(target.id,p_project_id,p_protocol_id,replacement,target.storage_path,target.preview_path);
  insert into public.test_artifacts(test_run_id,kind,bucket_id,storage_path,file_name,mime_type,size_bytes,preview_path,sha256,metadata,created_at)
    select fresh.id,a.kind,a.bucket_id,a.storage_path,a.file_name,a.mime_type,a.size_bytes,a.preview_path,a.sha256,
      a.metadata,a.created_at
    from public.available_test_artifacts a
    join public.test_runs old on old.id=a.test_run_id
    join public.test_cases old_case on old_case.id=old.test_case_id
    join public.test_cases fresh_case on fresh_case.protocol_id=replacement and fresh_case.position=old_case.position
    join public.test_runs fresh on fresh.protocol_id=replacement and fresh.test_case_id=fresh_case.id and fresh.product_id=old.product_id
    where old.protocol_id=p_protocol_id;
  update public.test_runs fresh set
    status=case when exists(select 1 from public.test_artifacts a where a.test_run_id=fresh.id) then 'uploaded' else 'pending' end,
    generation_time_seconds=old.generation_time_seconds,retry_count=old.retry_count,
    manually_edited=old.manually_edited,notes=old.notes
    from public.test_runs old,public.test_cases old_case,public.test_cases fresh_case
    where old.protocol_id=p_protocol_id and old_case.id=old.test_case_id
      and fresh_case.protocol_id=replacement and fresh_case.position=old_case.position
      and fresh.protocol_id=replacement and fresh.test_case_id=fresh_case.id and fresh.product_id=old.product_id;
  return jsonb_build_object('protocolId',replacement,'cacheArtifactIds',(select coalesce(jsonb_agg(id),'[]'::jsonb) from public.test_artifacts where storage_path=target.storage_path and kind='video'),'storagePaths',to_jsonb(array_remove(array[target.storage_path,target.preview_path],null)));
end;
$$;

create function public.finish_test_artifact_deletion(p_project_id uuid,p_artifact_id uuid)
returns void language sql security invoker set search_path = '' as $$
  update public.test_artifact_deletions set cleaned_at=coalesce(cleaned_at,now())
    where project_id=p_project_id and artifact_id=p_artifact_id;
$$;
create function public.pending_test_artifact_deletions(p_project_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('artifactId',d.artifact_id,'protocolId',d.protocol_id,'fileName',a.file_name)), '[]'::jsonb)
    from public.test_artifact_deletions d join public.test_artifacts a on a.id=d.artifact_id
    where d.project_id=p_project_id and d.cleaned_at is null;
$$;
revoke all on function public.remove_test_artifact(uuid,uuid,uuid), public.finish_test_artifact_deletion(uuid,uuid), public.pending_test_artifact_deletions(uuid) from public,anon,authenticated;
grant execute on function public.remove_test_artifact(uuid,uuid,uuid), public.finish_test_artifact_deletion(uuid,uuid), public.pending_test_artifact_deletions(uuid) to service_role;
comment on table public.test_artifact_deletions is 'Minimal deletion/cleanup receipt, no file binary. Storage API removal is retried until cleaned_at.';
comment on column public.protocols.retest_of_protocol_id is 'Exact task copy for a changed upload set. Derived scores are immutable; deleted upload binaries are not retained.';

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
      from public.available_test_artifacts artifact
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
