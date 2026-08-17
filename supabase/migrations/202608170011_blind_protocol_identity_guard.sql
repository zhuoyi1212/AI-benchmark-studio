-- M8 Blind hardening. Validate that locked Protocol text does not disclose a
-- selected product name before any Blind Review projection is returned.

create function public.assert_blind_protocol_safe(
  p_project_id uuid,
  p_protocol_id uuid
)
returns void
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.protocols
    where id = p_protocol_id
      and project_id = p_project_id
      and status = 'locked'
  ) then
    raise exception 'Blind Review requires a locked Protocol';
  end if;

  if exists (
    select 1
    from public.project_products project_product
    join public.products product on product.id = project_product.product_id
    join public.protocols protocol on protocol.id = p_protocol_id
    where project_product.project_id = p_project_id
      and char_length(btrim(product.name)) >= 3
      and (
        lower(protocol.title || ' ' || protocol.goal || ' ' || protocol.rules::text) like '%' || lower(btrim(product.name)) || '%'
        or exists (
          select 1 from public.test_cases test_case
          where test_case.protocol_id = p_protocol_id
            and lower(test_case.title || ' ' || test_case.objective || ' ' || test_case.prompt || ' ' || coalesce(test_case.input_description, '') || ' ' || test_case.input_artifacts::text || ' ' || test_case.observation_focus::text || ' ' || test_case.execution_rules::text)
              like '%' || lower(btrim(product.name)) || '%'
        )
        or exists (
          select 1 from public.rubric_dimensions rubric
          where rubric.protocol_id = p_protocol_id
            and lower(rubric.name || ' ' || coalesce(rubric.description, '') || ' ' || rubric.scoring_standard::text)
              like '%' || lower(btrim(product.name)) || '%'
        )
      )
  ) then
    raise exception 'Locked Protocol contains product identity and is unsafe for Blind Review';
  end if;
end;
$$;

comment on function public.assert_blind_protocol_safe(uuid, uuid) is
  'Rejects identity-bearing Protocol text without returning product names or mappings.';

revoke all on function public.assert_blind_protocol_safe(uuid, uuid) from public, anon, authenticated;
grant execute on function public.assert_blind_protocol_safe(uuid, uuid) to service_role;
