-- Draft Protocol review may remove a TestCase, while locked Protocol history
-- remains immutable. Deletion and contiguous position repair are atomic.

create function public.remove_draft_test_case(
  p_project_id uuid,
  p_protocol_id uuid,
  p_test_case_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_version integer;
  test_case_count integer;
  next_position integer := 1;
  remaining_case record;
begin
  perform 1
  from public.projects
  where id = p_project_id
    and deleted_at is null
    and status = 'protocol_draft'
  for update;
  if not found then
    raise exception 'Project is unavailable for draft Protocol editing';
  end if;

  select version into target_version
  from public.protocols
  where id = p_protocol_id
    and project_id = p_project_id
    and status = 'draft'
  for update;
  if target_version is null then
    raise exception 'Draft Protocol not found';
  end if;
  if target_version <> (
    select max(version)
    from public.protocols
    where project_id = p_project_id
  ) then
    raise exception 'Only the latest draft Protocol can be edited';
  end if;

  perform 1
  from public.test_cases
  where protocol_id = p_protocol_id
  for update;

  select count(*) into test_case_count
  from public.test_cases
  where protocol_id = p_protocol_id;
  if test_case_count <= 1 then
    raise exception 'A Protocol must retain at least one TestCase';
  end if;
  if not exists (
    select 1
    from public.test_cases
    where id = p_test_case_id
      and protocol_id = p_protocol_id
  ) then
    raise exception 'TestCase does not belong to the draft Protocol';
  end if;

  delete from public.test_cases
  where id = p_test_case_id
    and protocol_id = p_protocol_id;

  for remaining_case in
    select id
    from public.test_cases
    where protocol_id = p_protocol_id
    order by position
  loop
    update public.test_cases
    set position = next_position
    where id = remaining_case.id;
    next_position := next_position + 1;
  end loop;

  if exists (
    select 1
    from (
      select count(*) as case_count,
        count(distinct position) as distinct_position_count,
        min(position) as first_position,
        max(position) as last_position
      from public.test_cases
      where protocol_id = p_protocol_id
    ) positions
    where positions.case_count < 1
      or positions.distinct_position_count <> positions.case_count
      or positions.first_position <> 1
      or positions.last_position <> positions.case_count
  ) then
    raise exception 'Draft Protocol TestCase positions must remain contiguous';
  end if;

  update public.protocols
  set updated_at = now()
  where id = p_protocol_id;
end;
$$;
comment on function public.remove_draft_test_case(uuid, uuid, uuid) is
  'Atomically removes one TestCase from the current latest draft Protocol and compacts remaining positions.';
revoke all on function public.remove_draft_test_case(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.remove_draft_test_case(uuid, uuid, uuid) to service_role;
