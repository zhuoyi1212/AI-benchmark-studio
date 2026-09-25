-- Allow versioned product research to restart from any active project stage.
-- Existing ResearchRuns, Protocols, TestRuns, and derived records remain history.

create or replace function public.begin_product_research(
  p_project_id uuid,
  p_input_snapshot jsonb,
  p_input_signature text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_run_id uuid;
  next_version integer;
  selected_product_count integer;
begin
  perform 1
  from public.projects
  where id = p_project_id
    and deleted_at is null
  for update;
  if not found then
    raise exception 'Project is unavailable for product research';
  end if;
  if p_input_snapshot is null or jsonb_typeof(p_input_snapshot) <> 'object' then
    raise exception 'Research input snapshot must be a JSON object';
  end if;
  if char_length(btrim(coalesce(p_input_signature, ''))) = 0 then
    raise exception 'Research input signature is required';
  end if;
  if exists (
    select 1 from public.research_runs
    where project_id = p_project_id and status in ('pending', 'running')
  ) then
    raise exception 'Project already has an active ResearchRun';
  end if;
  select count(*) into selected_product_count
  from public.project_products
  where project_id = p_project_id;
  if selected_product_count < 1 or selected_product_count > 3 then
    raise exception 'Research requires 1-3 selected products';
  end if;

  select coalesce(max(version), 0) + 1 into next_version
  from public.research_runs
  where project_id = p_project_id;

  insert into public.research_runs (
    project_id,
    version,
    status,
    input_snapshot,
    input_signature
  ) values (
    p_project_id,
    next_version,
    'pending',
    p_input_snapshot,
    btrim(p_input_signature)
  ) returning id into new_run_id;

  update public.research_runs
  set status = 'running', started_at = now()
  where id = new_run_id;

  update public.projects
  set status = 'researching', updated_at = now()
  where id = p_project_id;

  return new_run_id;
end;
$$;

comment on function public.begin_product_research(uuid, jsonb, text) is
  'Starts a versioned ResearchRun from any active project stage while preserving downstream history.';

revoke all on function public.begin_product_research(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.begin_product_research(uuid, jsonb, text) to service_role;
