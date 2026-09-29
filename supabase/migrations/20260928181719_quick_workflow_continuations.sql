create or replace function public.finish_quick_job(p_id uuid, p_token uuid, p_status text, p_result jsonb default null, p_error text default null, p_next jsonb default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare target public.quick_jobs%rowtype;
begin
  select * into target from public.quick_jobs where id = p_id and status = 'running' and lease_token = p_token and lease_until > now() for update;
  if target.id is null then raise exception 'Worker lease lost'; end if;
  if p_status not in ('completed','failed','queued','cancelled') then raise exception 'Invalid completion status'; end if;
  update public.quick_jobs set status = p_status, result = p_result, error_message = left(p_error, 2000),
    lease_token = null, lease_until = null, updated_at = now(), available_at = case when p_result->>'continuation' = 'true' then now() else now() + interval '30 seconds' end,
    attempts = case when p_result->>'continuation' = 'true' then greatest(attempts - 1, 0) else attempts end
    where id = target.id;
  if p_status = 'completed' and p_next is not null then
    perform public.enqueue_quick_job(target.project_id, p_next->>'kind', p_next->>'scope', coalesce(p_next->'payload', '{}'::jsonb));
  end if;
end;
$$;
