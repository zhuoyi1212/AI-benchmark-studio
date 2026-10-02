-- Explicit product identity without rewriting products, snapshots or historical experiments.
create or replace function public.create_benchmark_project(
  p_name text,
  p_intent text,
  p_products jsonb,
  p_evaluation_mode text,
  p_owner_id uuid default null
)
returns uuid
language plpgsql
security invoker
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
  selected_product public.products;
  selected_ids uuid[] := array[]::uuid[];
begin
  if char_length(btrim(coalesce(p_name, ''))) = 0 or char_length(btrim(coalesce(p_name, ''))) > 120 then
    raise exception 'Project name must contain 1-120 characters';
  end if;
  if char_length(btrim(coalesce(p_intent, ''))) = 0 or char_length(btrim(coalesce(p_intent, ''))) > 4000 then
    raise exception 'Project intent must contain 1-4000 characters';
  end if;
  if p_evaluation_mode not in ('quick', 'professional') then
    raise exception 'Invalid project evaluation mode';
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

  insert into public.projects (owner_id, name, intent, status, evaluation_mode, quick_preparation_status)
  values (p_owner_id, btrim(p_name), btrim(p_intent), 'draft', p_evaluation_mode,
    case when p_evaluation_mode = 'quick' then 'running' else 'idle' end)
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

    if nullif(product_item->>'productId', '') is not null then
      select * into selected_product from public.products
      where id = (product_item->>'productId')::uuid and archived_at is null for share;
      if not found then raise exception using errcode = 'P1002', message = 'Selected product is unavailable'; end if;
      selected_product_id := selected_product.id;
      -- Explicit identity wins over untrusted submitted labels/URLs.
      product_name := selected_product.name;
      product_url := selected_product.official_url;
    else
      insert into public.products(created_by, name, normalized_name, official_url)
      values (p_owner_id, product_name, normalized_product_name, product_url)
      on conflict (normalized_name) do nothing;
      select * into selected_product from public.products
      where normalized_name = normalized_product_name for share;
      if selected_product.archived_at is not null then
        raise exception using errcode = 'P1002', message = 'Selected product is unavailable';
      end if;
      if product_url is not null and selected_product.official_url is not null
        and lower(regexp_replace(rtrim(product_url, '/'), '^https?://(www\.)?', '', 'i'))
          <> lower(regexp_replace(rtrim(selected_product.official_url, '/'), '^https?://(www\.)?', '', 'i')) then
        raise exception using errcode = 'P1001', message = 'Product name conflicts with a different official URL';
      end if;
      selected_product_id := selected_product.id;
      product_url := coalesce(product_url, selected_product.official_url);
    end if;
    if selected_product_id = any(selected_ids) then
      raise exception using errcode = 'P1003', message = 'Duplicate product identity in project';
    end if;
    selected_ids := array_append(selected_ids, selected_product_id);

    insert into public.project_products (
      project_id, product_id, display_order, submitted_name, submitted_official_url
    ) values (
      new_project_id, selected_product_id, product_position, product_name, product_url
    );
  end loop;

  return new_project_id;
end;
$$;

-- Preserve the legacy default mode and idle preparation state, with the same identity checks.
create or replace function public.create_benchmark_project(
  p_name text, p_intent text, p_products jsonb, p_owner_id uuid default null
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare new_id uuid;
begin
  new_id := public.create_benchmark_project(p_name, p_intent, p_products, 'quick', p_owner_id);
  update public.projects set quick_preparation_status = 'idle' where id = new_id;
  return new_id;
end;
$$;
revoke all on function public.create_benchmark_project(text,text,jsonb,text,uuid) from public,anon,authenticated;
revoke all on function public.create_benchmark_project(text,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.create_benchmark_project(text,text,jsonb,text,uuid) to service_role;
grant execute on function public.create_benchmark_project(text,text,jsonb,uuid) to service_role;
