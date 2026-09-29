begin;
do $test$
declare
  project uuid; job uuid; first_claim public.quick_jobs; recovered public.quick_jobs; denied boolean;
begin
  insert into public.projects(name,intent,evaluation_mode) values ('[E2E] Quick queue contract','Transaction-only fixture','quick') returning id into project;
  job := public.enqueue_quick_job(project,'research',project::text);
  assert public.enqueue_quick_job(project,'research',project::text) = job, 'duplicate enqueue';
  select * into first_claim from public.claim_quick_job(project);
  assert first_claim.id = job, 'claim missing';
  assert not exists(select 1 from public.claim_quick_job(project)), 'concurrent claim';
  update public.quick_jobs set lease_until = now() - interval '1 second' where id = job;
  denied := false;
  begin perform public.save_quick_step(job, first_claim.lease_token, 'draft', '{"ok":true}');
  exception when others then denied := true; end;
  assert denied, 'expired worker saved';
  select * into recovered from public.claim_quick_job(project);
  assert recovered.lease_token <> first_claim.lease_token and recovered.attempts = 2, 'reclaim missing';
  denied := false;
  begin perform public.finish_quick_job(job, first_claim.lease_token, 'completed');
  exception when others then denied := true; end;
  assert denied, 'stale worker completed';
  perform public.save_quick_step(job,recovered.lease_token,'draft','{"ok":true}');
  perform public.save_quick_step(job,recovered.lease_token,'draft','{"ok":false}');
  assert (select output from public.quick_job_steps where job_id=job and step_key='draft') = '{"ok":true}'::jsonb, 'checkpoint overwritten';
  perform public.finish_quick_job(job,recovered.lease_token,'completed',null,null,'{"kind":"protocol","scope":"fixture"}');
  assert (select count(*) from public.quick_jobs where project_id=project) = 2, 'successor missing';
  assert not has_table_privilege('anon','public.quick_job_steps','SELECT'), 'anon can read';
  assert not has_table_privilege('authenticated','public.quick_jobs','SELECT'), 'authenticated can read';
  assert not has_function_privilege('anon','public.claim_quick_job(uuid)','EXECUTE'), 'anon can claim';
  update public.projects set deleted_at=now() where id=project;
  assert not exists(select 1 from public.claim_quick_job(project)), 'archived project claimed';
end
$test$;
rollback;
