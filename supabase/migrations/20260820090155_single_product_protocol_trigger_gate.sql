-- Keep the Protocol trigger aligned with the single-product RPC gate.
-- Comparability remains required for comparison projects, but is compatibility
-- metadata rather than a blocker when the project has exactly one product.

create or replace function private.validate_protocol_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  test_case_count integer;
  rubric_count integer;
  total_weight numeric;
begin
  if tg_op = 'DELETE' then
    if old.status = 'locked' then
      raise exception 'Locked protocol % is immutable; create a new version instead', old.id;
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' and new.status <> 'draft' then
    raise exception 'A protocol must be created as draft before it can be locked';
  end if;

  if tg_op = 'INSERT' and not exists (
    select 1
    from public.research_runs research
    where research.id = new.research_run_id
      and research.project_id = new.project_id
      and research.status = 'completed'
      and (
        research.comparability->>'status' in ('comparable', 'partially_comparable')
        or (select count(*) from public.project_products where project_id = new.project_id) = 1
      )
  ) then
    raise exception 'Protocol requires completed research and comparison projects require comparable products';
  end if;

  if tg_op = 'UPDATE' and old.status = 'locked' then
    raise exception 'Locked protocol % is immutable; create a new version instead', old.id;
  end if;

  if tg_op = 'UPDATE' and row(old.project_id, old.research_run_id, old.version)
    is distinct from row(new.project_id, new.research_run_id, new.version) then
    raise exception 'Protocol source and version are immutable';
  end if;

  if new.status = 'locked' then
    select count(*) into test_case_count from public.test_cases where protocol_id = new.id;
    select count(*), coalesce(sum(weight), 0) into rubric_count, total_weight
      from public.rubric_dimensions where protocol_id = new.id;
    if test_case_count = 0 then raise exception 'A protocol needs at least one test case'; end if;
    if rubric_count = 0 or total_weight <> 100 then
      raise exception 'Rubric weights must total exactly 100 before locking';
    end if;
    if new.generation_model is null or new.prompt_version is null or new.input_signature is null then
      raise exception 'Generated Protocol metadata is required before locking';
    end if;
    new.locked_at := coalesce(new.locked_at, now());
  end if;
  return new;
end;
$$;
