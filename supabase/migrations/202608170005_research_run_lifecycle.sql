-- M4 ResearchRun lifecycle and explicit metadata for the three routed AI tasks.

alter table public.research_runs
  add column search_provider text check (search_provider is null or search_provider in ('zhipu', 'deepseek')),
  add column search_model text,
  add column search_prompt_version text,
  add column comparability_provider text check (comparability_provider is null or comparability_provider in ('zhipu', 'deepseek')),
  add column comparability_model text,
  add column comparability_prompt_version text,
  add column comparability_input_tokens bigint check (comparability_input_tokens is null or comparability_input_tokens >= 0),
  add column comparability_output_tokens bigint check (comparability_output_tokens is null or comparability_output_tokens >= 0),
  add column comparability_latency_ms integer check (comparability_latency_ms is null or comparability_latency_ms >= 0),
  add column comparability_estimated_cost numeric(14, 6) check (comparability_estimated_cost is null or comparability_estimated_cost >= 0);

alter table public.product_research
  add constraint product_research_sources_nonempty
  check (jsonb_array_length(sources) > 0);

create function public.begin_product_research(
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
    and status in ('draft', 'researching', 'research_ready')
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

create function public.complete_product_research(
  p_research_run_id uuid,
  p_search_provider text,
  p_search_model text,
  p_search_prompt_version text,
  p_synthesis_provider text,
  p_synthesis_model text,
  p_synthesis_prompt_version text,
  p_synthesis_usage jsonb,
  p_comparability_provider text,
  p_comparability_model text,
  p_comparability_prompt_version text,
  p_comparability_usage jsonb,
  p_comparability jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_project_id uuid;
begin
  select project_id into target_project_id
  from public.research_runs
  where id = p_research_run_id and status = 'running'
  for update;
  if target_project_id is null then
    raise exception 'Running ResearchRun not found';
  end if;
  if p_comparability is null
    or jsonb_typeof(p_comparability) <> 'object'
    or p_comparability->>'status' not in ('comparable', 'partially_comparable', 'not_comparable') then
    raise exception 'A valid ComparabilityResult is required';
  end if;
  if p_synthesis_usage is null or jsonb_typeof(p_synthesis_usage) <> 'object'
    or p_comparability_usage is null or jsonb_typeof(p_comparability_usage) <> 'object' then
    raise exception 'Research usage metadata must be JSON objects';
  end if;
  if p_search_provider <> 'zhipu' or p_synthesis_provider <> 'zhipu' or p_comparability_provider <> 'deepseek' then
    raise exception 'Research task routes do not match the first-version provider policy';
  end if;
  if char_length(btrim(coalesce(p_search_model, ''))) = 0
    or char_length(btrim(coalesce(p_search_prompt_version, ''))) = 0
    or char_length(btrim(coalesce(p_synthesis_model, ''))) = 0
    or char_length(btrim(coalesce(p_synthesis_prompt_version, ''))) = 0
    or char_length(btrim(coalesce(p_comparability_model, ''))) = 0
    or char_length(btrim(coalesce(p_comparability_prompt_version, ''))) = 0 then
    raise exception 'Research routing metadata is required';
  end if;

  update public.research_runs
  set status = 'completed',
      search_provider = p_search_provider,
      search_model = btrim(p_search_model),
      search_prompt_version = btrim(p_search_prompt_version),
      provider = p_synthesis_provider,
      model = btrim(p_synthesis_model),
      prompt_version = btrim(p_synthesis_prompt_version),
      input_tokens = (p_synthesis_usage->>'inputTokens')::bigint,
      output_tokens = (p_synthesis_usage->>'outputTokens')::bigint,
      latency_ms = (p_synthesis_usage->>'latencyMs')::integer,
      estimated_cost = (p_synthesis_usage->>'estimatedCost')::numeric,
      comparability_provider = p_comparability_provider,
      comparability_model = btrim(p_comparability_model),
      comparability_prompt_version = btrim(p_comparability_prompt_version),
      comparability_input_tokens = (p_comparability_usage->>'inputTokens')::bigint,
      comparability_output_tokens = (p_comparability_usage->>'outputTokens')::bigint,
      comparability_latency_ms = (p_comparability_usage->>'latencyMs')::integer,
      comparability_estimated_cost = (p_comparability_usage->>'estimatedCost')::numeric,
      comparability = p_comparability
  where id = p_research_run_id;

  update public.projects
  set status = 'research_ready', updated_at = now()
  where id = target_project_id;
end;
$$;

create function public.fail_product_research(
  p_research_run_id uuid,
  p_error_message text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_project_id uuid;
begin
  select project_id into target_project_id
  from public.research_runs
  where id = p_research_run_id and status in ('pending', 'running')
  for update;
  if target_project_id is null then
    raise exception 'Active ResearchRun not found';
  end if;
  if char_length(btrim(coalesce(p_error_message, ''))) = 0 then
    raise exception 'Research failure reason is required';
  end if;

  update public.research_runs
  set status = 'failed', error_message = left(btrim(p_error_message), 1000)
  where id = p_research_run_id;

  update public.projects
  set status = case
      when exists (
        select 1 from public.research_runs
        where project_id = target_project_id and status = 'completed'
      ) then 'research_ready'
      else 'draft'
    end,
    updated_at = now()
  where id = target_project_id;
end;
$$;

comment on function public.begin_product_research(uuid, jsonb, text) is
  'Atomically versions and starts a ResearchRun while preventing concurrent active runs.';
comment on function public.complete_product_research(uuid, text, text, text, text, text, text, jsonb, text, text, text, jsonb, jsonb) is
  'Completes a ResearchRun with explicit Search, Synthesis, and Comparability routing metadata.';
comment on function public.fail_product_research(uuid, text) is
  'Records an explicit terminal ResearchRun failure without deleting prior runs.';

revoke all on function public.begin_product_research(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.complete_product_research(uuid, text, text, text, text, text, text, jsonb, text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.fail_product_research(uuid, text) from public, anon, authenticated;
grant execute on function public.begin_product_research(uuid, jsonb, text) to service_role;
grant execute on function public.complete_product_research(uuid, text, text, text, text, text, text, jsonb, text, text, text, jsonb, jsonb) to service_role;
grant execute on function public.fail_product_research(uuid, text) to service_role;
