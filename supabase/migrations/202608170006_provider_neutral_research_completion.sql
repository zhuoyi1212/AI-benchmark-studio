-- Keep task routing in the centralized AI Router. The database records route
-- metadata but does not decide which provider owns a task.

create or replace function public.complete_product_research(
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
  if p_search_provider not in ('zhipu', 'deepseek')
    or p_synthesis_provider not in ('zhipu', 'deepseek')
    or p_comparability_provider not in ('zhipu', 'deepseek') then
    raise exception 'Unsupported AI provider metadata';
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

comment on function public.complete_product_research(uuid, text, text, text, text, text, text, jsonb, text, text, text, jsonb, jsonb) is
  'Completes Research with recorded route metadata; provider task ownership remains in the AI Router.';
