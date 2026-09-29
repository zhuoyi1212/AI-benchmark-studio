-- Durable execution records. Business entities remain the source of truth.
create table public.quick_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  kind text not null check (kind in ('research','protocol','evaluate','findings','discovery','publish','analysis','report')),
  scope text not null check (length(scope) between 1 and 200),
  payload jsonb not null default '{}' check (jsonb_typeof(payload) = 'object'),
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  lease_token uuid,
  lease_until timestamptz,
  available_at timestamptz not null default now(),
  stage text,
  error_message text,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, kind, scope),
  check ((status = 'running') = (lease_token is not null and lease_until is not null))
);
create index quick_jobs_dispatch on public.quick_jobs (available_at, created_at) where status in ('queued','running');
create index quick_jobs_project on public.quick_jobs (project_id, created_at desc);
create table public.quick_job_steps (
  job_id uuid not null references public.quick_jobs(id) on delete restrict,
  step_key text not null,
  output jsonb not null,
  created_at timestamptz not null default now(),
  primary key (job_id, step_key)
);
alter table public.quick_jobs enable row level security;
alter table public.quick_job_steps enable row level security;
revoke all on public.quick_jobs, public.quick_job_steps from public, anon, authenticated;
grant select, insert, update on public.quick_jobs to service_role;
grant select, insert on public.quick_job_steps to service_role;

create function public.enqueue_quick_job(p_project_id uuid, p_kind text, p_scope text, p_payload jsonb default '{}')
returns uuid language plpgsql security invoker set search_path = '' as $$
declare target_id uuid;
begin
  if not exists (select 1 from public.projects where id = p_project_id and deleted_at is null and evaluation_mode = 'quick') then
    raise exception 'An active quick project is required';
  end if;
  insert into public.quick_jobs(project_id, kind, scope, payload)
    values(p_project_id, p_kind, p_scope, p_payload)
    on conflict (project_id, kind, scope) do nothing returning id into target_id;
  if target_id is null then
    select id into target_id from public.quick_jobs where project_id = p_project_id and kind = p_kind and scope = p_scope;
  end if;
  return target_id;
end;
$$;

create function public.claim_quick_job(p_project_id uuid default null)
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

create function public.finish_quick_job(p_id uuid, p_token uuid, p_status text, p_result jsonb default null, p_error text default null, p_next jsonb default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare target public.quick_jobs%rowtype;
begin
  select * into target from public.quick_jobs where id = p_id and status = 'running' and lease_token = p_token and lease_until > now() for update;
  if target.id is null then raise exception 'Worker lease lost'; end if;
  if p_status not in ('completed','failed','queued','cancelled') then raise exception 'Invalid completion status'; end if;
  update public.quick_jobs set status = p_status, result = p_result, error_message = left(p_error, 2000),
    lease_token = null, lease_until = null, updated_at = now(), available_at = now() + interval '30 seconds'
    where id = target.id;
  if p_status = 'completed' and p_next is not null then
    perform public.enqueue_quick_job(target.project_id, p_next->>'kind', p_next->>'scope', coalesce(p_next->'payload', '{}'::jsonb));
  end if;
end;
$$;

create function public.save_quick_step(p_id uuid, p_token uuid, p_key text, p_output jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.quick_jobs where id = p_id and status = 'running' and lease_token = p_token and lease_until > now() for update;
  if not found then raise exception 'Worker lease lost'; end if;
  insert into public.quick_job_steps(job_id, step_key, output) values (p_id, p_key, p_output) on conflict do nothing;
end;
$$;

revoke all on function public.enqueue_quick_job(uuid,text,text,jsonb), public.claim_quick_job(uuid),
  public.finish_quick_job(uuid,uuid,text,jsonb,text,jsonb), public.save_quick_step(uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.enqueue_quick_job(uuid,text,text,jsonb), public.claim_quick_job(uuid),
  public.finish_quick_job(uuid,uuid,text,jsonb,text,jsonb), public.save_quick_step(uuid,uuid,text,jsonb) to service_role;
