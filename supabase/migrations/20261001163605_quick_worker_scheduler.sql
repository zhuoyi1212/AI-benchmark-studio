-- Supabase schedules only due work; Vercel remains the execution host.
-- No HTTP call is made until both deployment secrets are provisioned in Vault.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create function private.dispatch_quick_worker()
returns bigint language plpgsql security invoker set search_path = '' as $$
declare
  worker_origin text;
  worker_secret text;
begin
  if not exists (
    select 1 from public.quick_jobs j
    join public.projects p on p.id = j.project_id
    where p.deleted_at is null and p.evaluation_mode = 'quick'
      and ((j.status = 'queued' and j.available_at <= now())
        or (j.status = 'running' and j.lease_until < now()))
      and not exists (
        select 1 from public.quick_jobs active
        where active.project_id = j.project_id and active.id <> j.id
          and active.status = 'running' and active.lease_until >= now()
      )
  ) then return null; end if;

  select decrypted_secret into worker_origin from vault.decrypted_secrets
    where name = 'benchmark_quick_worker_origin';
  select decrypted_secret into worker_secret from vault.decrypted_secrets
    where name = 'benchmark_quick_worker_secret';
  if worker_origin is null or worker_secret is null then return null; end if;
  if worker_origin !~ '^https://[a-zA-Z0-9.-]+$' or length(worker_secret) < 32 then
    raise exception 'Invalid quick worker deployment configuration';
  end if;

  return net.http_get(
    url := worker_origin || '/api/cron/quick-workflow',
    headers := jsonb_build_object('Authorization', 'Bearer ' || worker_secret),
    timeout_milliseconds := 310000
  );
end;
$$;
revoke all on function private.dispatch_quick_worker() from public, anon, authenticated, service_role;

select cron.schedule('benchmark-quick-worker', '30 seconds', 'select private.dispatch_quick_worker();');
