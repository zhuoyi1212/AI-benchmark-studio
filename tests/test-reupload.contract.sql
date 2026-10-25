-- Run inside BEGIN/ROLLBACK against an existing complete fixture or chosen source.
-- The caller sets reupload_test.project_id, applies the migration in the same
-- transaction if needed, then switches to service_role. No changes persist.
do $$
declare
  project uuid := current_setting('reupload_test.project_id')::uuid;
  source uuid;
  replacement uuid;
  before_runs jsonb;
  before_artifacts jsonb;
  before_cases jsonb;
  after_cases jsonb;
  before_rubric jsonb;
  after_rubric jsonb;
  active_job uuid;
begin
  select id into source from public.protocols where project_id = project order by version desc limit 1;
  select jsonb_agg(to_jsonb(r) order by r.id) into before_runs from public.test_runs r where protocol_id = source;
  select jsonb_agg(to_jsonb(a) order by a.id) into before_artifacts from public.test_artifacts a join public.test_runs r on r.id = a.test_run_id where r.protocol_id = source;
  select jsonb_agg(to_jsonb(c) - array['id','protocol_id','created_at','updated_at'] order by position) into before_cases from public.test_cases c where protocol_id = source;
  select jsonb_agg(to_jsonb(d) - array['id','protocol_id','created_at','updated_at'] order by position) into before_rubric from public.rubric_dimensions d where protocol_id = source;
  if before_artifacts is null then raise exception 'Choose an Artifact-backed test source'; end if;

  insert into public.quick_jobs(project_id,kind,scope,status) values(project,'evaluate','reupload-contract-' || gen_random_uuid(),'queued') returning id into active_job;
  begin
    perform public.restart_test_execution(project,source);
    raise exception 'Active queue was not blocked';
  exception when sqlstate 'P2102' then null;
  end;
  update public.quick_jobs set status = 'cancelled' where id = active_job;

  replacement := public.restart_test_execution(project,source);
  if public.restart_test_execution(project,source) <> replacement then raise exception 'Duplicate submission created another round'; end if;
  if (select retest_of_protocol_id from public.protocols where id = replacement) <> source then raise exception 'Missing source lineage'; end if;
  if (select status from public.protocols where id = replacement) <> 'locked' then raise exception 'Replacement was not locked'; end if;
  if (select count(*) from public.test_runs where protocol_id = replacement) <> (select count(*) from public.test_cases where protocol_id = replacement) * (select count(*) from public.project_products where project_id = project) then raise exception 'Incomplete matrix'; end if;
  if exists (select 1 from public.test_runs where protocol_id = replacement and (status <> 'pending' or notes is not null or retry_count <> 0 or generation_time_seconds is not null or manually_edited)) then raise exception 'New runs inherited old execution metadata'; end if;
  if exists (select 1 from public.test_artifacts a join public.test_runs r on r.id=a.test_run_id where r.protocol_id=replacement) then raise exception 'Old artifacts leaked into new round'; end if;
  if before_runs is distinct from (select jsonb_agg(to_jsonb(r) order by r.id) from public.test_runs r where protocol_id=source) then raise exception 'Historical runs changed'; end if;
  if before_artifacts is distinct from (select jsonb_agg(to_jsonb(a) order by a.id) from public.test_artifacts a join public.test_runs r on r.id=a.test_run_id where r.protocol_id=source) then raise exception 'Historical artifacts changed'; end if;
  select jsonb_agg(to_jsonb(c) - array['id','protocol_id','created_at','updated_at'] order by position) into after_cases from public.test_cases c where protocol_id=replacement;
  select jsonb_agg(to_jsonb(d) - array['id','protocol_id','created_at','updated_at'] order by position) into after_rubric from public.rubric_dimensions d where protocol_id=replacement;
  if before_cases is distinct from after_cases or before_rubric is distinct from after_rubric then raise exception 'Locked task or rubric changed'; end if;
  begin
    perform public.restart_test_execution(project,replacement);
    raise exception 'Empty round was restarted';
  exception when sqlstate 'P2103' then null;
  end;
  begin
    perform public.restart_test_execution(gen_random_uuid(),source);
    raise exception 'Cross-project source accepted';
  exception when sqlstate 'P2100' then null;
  end;
  if has_function_privilege('anon','public.restart_test_execution(uuid,uuid)','execute') or has_function_privilege('authenticated','public.restart_test_execution(uuid,uuid)','execute') then raise exception 'Client can restart directly'; end if;
end;
$$;
