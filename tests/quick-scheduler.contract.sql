-- Run as postgres in one transaction; ROLLBACK prevents any HTTP delivery.
begin;
set local statement_timeout = '15s';
do $$
declare project_id uuid; request_id bigint; test_secret text := repeat('fixture-only-', 4);
begin
  if has_function_privilege('anon', 'private.dispatch_quick_worker()', 'execute')
    or has_function_privilege('authenticated', 'private.dispatch_quick_worker()', 'execute')
    or has_function_privilege('service_role', 'private.dispatch_quick_worker()', 'execute') then
    raise exception 'Scheduler is exposed outside the database scheduler role';
  end if;
  if not exists(select 1 from cron.job where jobname='benchmark-quick-worker' and schedule='30 seconds') then
    raise exception 'Durable scheduler is missing';
  end if;
  if exists(select 1 from vault.secrets where name in ('benchmark_quick_worker_origin','benchmark_quick_worker_secret')) then
    raise exception 'Run this pre-provisioning contract before setting deployment secrets';
  end if;
  project_id := public.create_benchmark_project(
    '[E2E] scheduler contract', 'Synthetic scheduler validation',
    '[{"name":"Synthetic Scheduler Product","officialUrl":null}]'::jsonb,
    p_evaluation_mode := 'quick'
  );
  perform public.enqueue_quick_job(project_id, 'research', project_id::text);
  if private.dispatch_quick_worker() is not null then raise exception 'Missing secrets must fail closed'; end if;
  perform vault.create_secret('https://example.invalid', 'benchmark_quick_worker_origin');
  perform vault.create_secret(test_secret, 'benchmark_quick_worker_secret');
  request_id := private.dispatch_quick_worker();
  if request_id is null or not exists(
    select 1 from net.http_request_queue r where r.id=request_id
      and r.method='GET' and r.url='https://example.invalid/api/cron/quick-workflow'
      and r.headers->>'Authorization'='Bearer ' || test_secret
      and r.timeout_milliseconds=310000
  ) then raise exception 'Scheduler did not enqueue the authenticated worker request'; end if;
  raise notice 'scheduler contract passed; all fixture writes and outbound requests roll back';
end $$;
rollback;
