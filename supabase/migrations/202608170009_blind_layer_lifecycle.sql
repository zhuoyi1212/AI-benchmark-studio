-- M7 Blind Layer. Product identity mappings are created once, randomized,
-- append-only, and never returned by this function or granted to clients.

create function public.initialize_blind_layer(
  p_project_id uuid,
  p_protocol_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  product_count integer;
  test_case_count integer;
  expected_run_count integer;
  ready_run_count integer;
  existing_sample_count integer;
  existing_mapping_count integer;
  shuffled_product_id uuid;
  new_sample_id uuid;
  sample_number integer := 0;
begin
  perform 1
  from public.projects
  where id = p_project_id
    and deleted_at is null
    and status in ('testing', 'reviewing')
  for update;
  if not found then
    raise exception 'Project is unavailable for Blind Layer initialization';
  end if;

  if not exists (
    select 1 from public.protocols protocol
    where protocol.id = p_protocol_id
      and protocol.project_id = p_project_id
      and protocol.status = 'locked'
      and protocol.version = (
        select max(candidate.version)
        from public.protocols candidate
        where candidate.project_id = p_project_id
      )
  ) then
    raise exception 'Blind Layer requires the current latest locked Protocol';
  end if;

  select count(*) into product_count
  from public.project_products
  where project_id = p_project_id;
  select count(*) into test_case_count
  from public.test_cases
  where protocol_id = p_protocol_id;
  expected_run_count := product_count * test_case_count;
  select count(*) into ready_run_count
  from public.test_runs test_run
  where test_run.project_id = p_project_id
    and test_run.protocol_id = p_protocol_id
    and test_run.status = 'ready_for_review'
    and exists (
      select 1 from public.test_artifacts artifact
      where artifact.test_run_id = test_run.id
    );
  if product_count < 1 or product_count > 3
    or test_case_count < 1
    or ready_run_count <> expected_run_count then
    raise exception 'Blind Layer requires the complete ready Product x TestCase Artifact matrix';
  end if;

  select count(*) into existing_sample_count
  from public.blind_samples
  where protocol_id = p_protocol_id;
  select count(*) into existing_mapping_count
  from public.blind_mappings
  where protocol_id = p_protocol_id and project_id = p_project_id;
  if existing_sample_count > 0 or existing_mapping_count > 0 then
    if existing_sample_count <> product_count or existing_mapping_count <> product_count then
      raise exception 'Existing Blind Layer is incomplete and cannot be silently repaired';
    end if;
    update public.projects
    set status = 'reviewing', updated_at = now()
    where id = p_project_id and status <> 'reviewing';
    return;
  end if;

  for shuffled_product_id in
    select product_id
    from public.project_products
    where project_id = p_project_id
    order by extensions.gen_random_uuid()
  loop
    sample_number := sample_number + 1;
    insert into public.blind_samples (protocol_id, label)
    values (p_protocol_id, 'Sample ' || chr(64 + sample_number))
    returning id into new_sample_id;

    insert into public.blind_mappings (
      blind_sample_id,
      protocol_id,
      project_id,
      product_id
    ) values (
      new_sample_id,
      p_protocol_id,
      p_project_id,
      shuffled_product_id
    );
  end loop;

  update public.projects
  set status = 'reviewing', updated_at = now()
  where id = p_project_id;
end;
$$;

comment on function public.initialize_blind_layer(uuid, uuid) is
  'Creates one stable randomized Sample-to-Product mapping without returning identity data.';

revoke all on function public.initialize_blind_layer(uuid, uuid) from public, anon, authenticated;
grant execute on function public.initialize_blind_layer(uuid, uuid) to service_role;
