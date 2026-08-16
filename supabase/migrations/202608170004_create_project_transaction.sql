create function public.create_benchmark_project(
  p_name text,
  p_intent text,
  p_products jsonb,
  p_owner_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_project_id uuid;
  selected_product_id uuid;
  product_item jsonb;
  product_name text;
  product_url text;
  normalized_product_name text;
  product_position integer;
  product_count integer;
begin
  if char_length(btrim(coalesce(p_name, ''))) = 0 or char_length(btrim(coalesce(p_name, ''))) > 120 then
    raise exception 'Project name must contain 1-120 characters';
  end if;
  if char_length(btrim(coalesce(p_intent, ''))) = 0 or char_length(btrim(coalesce(p_intent, ''))) > 4000 then
    raise exception 'Project intent must contain 1-4000 characters';
  end if;
  if p_products is null or jsonb_typeof(p_products) <> 'array' then
    raise exception 'Products must be a JSON array';
  end if;
  product_count := jsonb_array_length(p_products);
  if product_count < 1 or product_count > 3 then
    raise exception 'A project requires 1-3 products';
  end if;
  if (
    select count(distinct lower(regexp_replace(btrim(value->>'name'), '\s+', ' ', 'g')))
    from jsonb_array_elements(p_products)
  ) <> product_count then
    raise exception 'Product names must be unique within a project';
  end if;

  insert into public.projects (owner_id, name, intent, status)
  values (p_owner_id, btrim(p_name), btrim(p_intent), 'draft')
  returning id into new_project_id;

  for product_item, product_position in
    select value, ordinality::integer
    from jsonb_array_elements(p_products) with ordinality
  loop
    product_name := btrim(coalesce(product_item->>'name', ''));
    product_url := nullif(btrim(coalesce(product_item->>'officialUrl', '')), '');
    normalized_product_name := lower(regexp_replace(product_name, '\s+', ' ', 'g'));
    if char_length(product_name) = 0 or char_length(product_name) > 120 then
      raise exception 'Product name must contain 1-120 characters';
    end if;
    if product_url is not null and product_url !~ '^https?://[^[:space:]]+$' then
      raise exception 'Product official URL must use HTTP(S)';
    end if;

    insert into public.products (created_by, name, normalized_name, official_url)
    values (p_owner_id, product_name, normalized_product_name, product_url)
    on conflict (normalized_name) do update
      set official_url = coalesce(public.products.official_url, excluded.official_url),
          updated_at = now()
    returning id into selected_product_id;

    insert into public.project_products (
      project_id,
      product_id,
      display_order,
      submitted_name,
      submitted_official_url
    ) values (
      new_project_id,
      selected_product_id,
      product_position,
      product_name,
      product_url
    );
  end loop;

  return new_project_id;
end;
$$;

comment on function public.create_benchmark_project(text, text, jsonb, uuid) is
  'Atomically creates a Project, reuses normalized Products, and records the 1-3 submitted ProjectProducts.';

revoke all on function public.create_benchmark_project(text, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.create_benchmark_project(text, text, jsonb, uuid) to service_role;
