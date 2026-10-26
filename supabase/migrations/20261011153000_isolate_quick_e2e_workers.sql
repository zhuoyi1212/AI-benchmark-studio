-- Prevent production cron from sending isolated test fixtures to live AI providers.
create or replace function public.claim_quick_job(p_project_id uuid default null)
returns setof public.quick_jobs language plpgsql security invoker set search_path = '' as $$
declare target_id uuid;
begin
  -- A dead worker is recoverable; repeated process deaths become an explicit failure.
  update public.quick_jobs set status = 'failed', lease_token = null, lease_until = null,
    error_message = '后台任务多次中断，请重试当前阶段。', updated_at = now()
    where status = 'running' and lease_until < now() and attempts >= 3;
  select j.id into target_id from public.quick_jobs j
    join public.projects p on p.id = j.project_id
    where p.deleted_at is null and p.evaluation_mode = 'quick'
      and (p_project_id is null or j.project_id = p_project_id)
      -- Reserved test fixtures require an explicit project-scoped worker.
      and (p_project_id is not null or p.name not like '[E2E]%')
      and ((j.status = 'queued' and j.available_at <= now()) or (j.status = 'running' and j.lease_until < now()))
      and not exists (select 1 from public.quick_jobs active where active.project_id = j.project_id
        and active.id <> j.id and active.status = 'running' and active.lease_until >= now())
    order by case when j.kind in ('analysis','report') then 1 else 0 end, j.created_at
    for update of j skip locked limit 1;
  if target_id is null then return; end if;
  -- Serialize claims for one project, including different kinds.
  perform pg_advisory_xact_lock(hashtextextended((select project_id::text from public.quick_jobs where id = target_id), 0));
  if exists (select 1 from public.quick_jobs active where active.project_id = (select project_id from public.quick_jobs where id = target_id)
      and active.id <> target_id and active.status = 'running' and active.lease_until >= now()) then return; end if;
  return query update public.quick_jobs set status = 'running', attempts = attempts + 1,
    lease_token = gen_random_uuid(), lease_until = now() + interval '15 minutes', updated_at = now(), error_message = null
    where id = target_id returning *;
end;
$$;
