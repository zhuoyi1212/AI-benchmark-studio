-- Caller applies the migration in BEGIN/ROLLBACK and sets reupload_test.project_id.
do $$
declare
  project uuid := current_setting('reupload_test.project_id')::uuid;
  source uuid;
  selected public.test_artifacts%rowtype;
  replacement uuid;
  result jsonb;
  remaining integer;
  original_scores jsonb;
  active_job uuid;
begin
  select id into source from public.protocols where project_id=project order by version desc limit 1;
  select a.* into selected from public.available_test_artifacts a join public.test_runs r on r.id=a.test_run_id where r.protocol_id=source order by a.created_at limit 1;
  if selected.id is null then raise exception 'Source needs uploads'; end if;
  select count(*)-1 into remaining from public.available_test_artifacts a join public.test_runs r on r.id=a.test_run_id where r.protocol_id=source;
  select jsonb_agg(to_jsonb(s) order by s.id) into original_scores from public.judge_scores s where protocol_id=source;
  insert into public.quick_jobs(project_id,kind,scope,status) values(project,'evaluate','delete-contract-'||gen_random_uuid(),'queued') returning id into active_job;
  begin
    perform public.remove_test_artifact(project,source,selected.id);
    raise exception 'Active work not blocked';
  exception when sqlstate 'P2102' then null; end;
  update public.quick_jobs set status='cancelled' where id=active_job;
  result := public.remove_test_artifact(project,source,selected.id);
  replacement := (result->>'protocolId')::uuid;
  if (select count(*) from public.available_test_artifacts a join public.test_runs r on r.id=a.test_run_id where r.protocol_id=replacement) <> remaining then raise exception 'Survivors lost'; end if;
  if exists(select 1 from public.available_test_artifacts where storage_path=selected.storage_path) then raise exception 'Deleted object still available'; end if;
  if exists(select 1 from public.test_artifacts fresh join public.test_runs r on r.id=fresh.test_run_id where r.protocol_id=replacement and not exists(select 1 from public.test_artifacts old join public.test_runs old_run on old_run.id=old.test_run_id where old_run.protocol_id=source and old.storage_path=fresh.storage_path and old.sha256=fresh.sha256)) then raise exception 'Surviving content changed'; end if;
  if exists(select 1 from public.test_runs where protocol_id=replacement and status='ready_for_review') then raise exception 'Analysis state retained'; end if;
  if original_scores is distinct from (select jsonb_agg(to_jsonb(s) order by s.id) from public.judge_scores s where protocol_id=source) then raise exception 'AI scores overwritten'; end if;
  if public.remove_test_artifact(project,source,selected.id) <> result then raise exception 'Retry is not idempotent'; end if;
  if jsonb_array_length(public.pending_test_artifact_deletions(project)) <> 1 then raise exception 'Missing cleanup receipt'; end if;
  perform public.finish_test_artifact_deletion(project,selected.id);
  if public.pending_test_artifact_deletions(project) <> '[]'::jsonb then raise exception 'Cleanup remains pending'; end if;
  if public.remove_test_artifact(project,source,selected.id)->'storagePaths' <> '[]'::jsonb then raise exception 'Completed cleanup retried'; end if;
  begin
    perform public.remove_test_artifact(project,source,gen_random_uuid());
    raise exception 'Unknown file accepted';
  exception when sqlstate 'P2103' then null; end;
  begin
    perform public.remove_test_artifact(gen_random_uuid(),source,selected.id);
    raise exception 'Cross-project source accepted';
  exception when sqlstate 'P2100' then null; end;
  if has_function_privilege('anon','public.remove_test_artifact(uuid,uuid,uuid)','execute') or has_function_privilege('authenticated','public.remove_test_artifact(uuid,uuid,uuid)','execute') then raise exception 'Client delete allowed'; end if;
  if has_table_privilege('anon','public.available_test_artifacts','select') or has_table_privilege('authenticated','public.test_artifact_deletions','select') then raise exception 'Private files leaked'; end if;
end;
$$;
