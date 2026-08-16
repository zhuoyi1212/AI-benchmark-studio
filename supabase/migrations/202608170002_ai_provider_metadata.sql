-- Provider-neutral AI run metadata. Provider-specific payloads and reasoning
-- traces are deliberately not stored as business data.

alter table public.research_runs
  add column provider text check (provider is null or provider in ('zhipu', 'deepseek')),
  add column input_tokens bigint check (input_tokens is null or input_tokens >= 0),
  add column output_tokens bigint check (output_tokens is null or output_tokens >= 0),
  add column latency_ms integer check (latency_ms is null or latency_ms >= 0),
  add column estimated_cost numeric(14, 6) check (estimated_cost is null or estimated_cost >= 0);

alter table public.protocols
  add column generation_provider text check (generation_provider is null or generation_provider in ('zhipu', 'deepseek')),
  add column generation_input_tokens bigint check (generation_input_tokens is null or generation_input_tokens >= 0),
  add column generation_output_tokens bigint check (generation_output_tokens is null or generation_output_tokens >= 0),
  add column generation_latency_ms integer check (generation_latency_ms is null or generation_latency_ms >= 0),
  add column generation_estimated_cost numeric(14, 6) check (generation_estimated_cost is null or generation_estimated_cost >= 0);

create table public.judge_case_runs (
  id uuid primary key default gen_random_uuid(),
  judge_run_id uuid not null,
  protocol_id uuid not null,
  test_case_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  provider text not null check (provider in ('zhipu', 'deepseek')),
  model text not null check (char_length(btrim(model)) > 0),
  prompt_version text not null check (char_length(btrim(prompt_version)) > 0),
  input_signature text not null check (char_length(btrim(input_signature)) > 0),
  input_tokens bigint check (input_tokens is null or input_tokens >= 0),
  output_tokens bigint check (output_tokens is null or output_tokens >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  estimated_cost numeric(14, 6) check (estimated_cost is null or estimated_cost >= 0),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (judge_run_id, test_case_id),
  unique (id, judge_run_id, test_case_id),
  foreign key (judge_run_id, protocol_id) references public.judge_runs(id, protocol_id) on delete restrict,
  foreign key (test_case_id, protocol_id) references public.test_cases(id, protocol_id) on delete restrict,
  check (status <> 'failed' or char_length(btrim(coalesce(error_message, ''))) > 0)
);

alter table public.judge_scores
  add column judge_case_run_id uuid not null,
  add foreign key (judge_case_run_id, judge_run_id, test_case_id)
    references public.judge_case_runs(id, judge_run_id, test_case_id) on delete restrict;

create index judge_case_runs_protocol_status_idx on public.judge_case_runs(protocol_id, status);
create index judge_case_runs_provider_model_idx on public.judge_case_runs(provider, model);

create trigger judge_case_runs_set_updated_at before update on public.judge_case_runs
for each row execute function private.set_updated_at();

create function private.validate_judge_case_run_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      raise exception 'A JudgeCaseRun must start as pending';
    end if;
    return new;
  end if;
  if row(old.judge_run_id, old.protocol_id, old.test_case_id, old.provider, old.model, old.prompt_version, old.input_signature)
    is distinct from row(new.judge_run_id, new.protocol_id, new.test_case_id, new.provider, new.model, new.prompt_version, new.input_signature) then
    raise exception 'JudgeCaseRun routing and inputs are immutable';
  end if;
  if old.status in ('completed', 'failed') then
    raise exception 'Terminal JudgeCaseRun % is immutable', old.id;
  end if;
  if not ((old.status = 'pending' and new.status in ('running', 'failed'))
    or (old.status = 'running' and new.status in ('completed', 'failed'))
    or old.status = new.status) then
    raise exception 'Invalid JudgeCaseRun status transition: % -> %', old.status, new.status;
  end if;
  if new.status = 'completed' then new.completed_at := coalesce(new.completed_at, now()); end if;
  return new;
end;
$$;

create trigger judge_case_runs_validate_transition before insert or update on public.judge_case_runs
for each row execute function private.validate_judge_case_run_transition();

create function private.validate_judge_case_score_route()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  routed_model text;
  routed_prompt_version text;
begin
  select model, prompt_version into routed_model, routed_prompt_version
  from public.judge_case_runs
  where id = new.judge_case_run_id
    and judge_run_id = new.judge_run_id
    and test_case_id = new.test_case_id
    and status = 'running';
  if routed_model is null then
    raise exception 'Judge score requires a running JudgeCaseRun for its TestCase';
  end if;
  if new.model <> routed_model or new.prompt_version <> routed_prompt_version then
    raise exception 'Every Blind Sample in a TestCase must use the JudgeCaseRun model and prompt version';
  end if;
  return new;
end;
$$;

create trigger judge_scores_validate_case_route before insert on public.judge_scores
for each row execute function private.validate_judge_case_score_route();

create function private.require_completed_judge_case_runs()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  expected_count integer;
  completed_count integer;
begin
  if new.status = 'completed' and old.status <> 'completed' then
    select count(*) into expected_count from public.test_cases where protocol_id = new.protocol_id;
    select count(*) into completed_count
      from public.judge_case_runs
      where judge_run_id = new.id and status = 'completed';
    if expected_count = 0 or completed_count <> expected_count then
      raise exception 'Completed JudgeRun requires one completed JudgeCaseRun per TestCase';
    end if;
  end if;
  return new;
end;
$$;

create trigger judge_runs_require_completed_case_runs before update on public.judge_runs
for each row execute function private.require_completed_judge_case_runs();

alter table public.result_analyses
  add column provider text check (provider is null or provider in ('zhipu', 'deepseek')),
  add column input_tokens bigint check (input_tokens is null or input_tokens >= 0),
  add column output_tokens bigint check (output_tokens is null or output_tokens >= 0),
  add column latency_ms integer check (latency_ms is null or latency_ms >= 0),
  add column estimated_cost numeric(14, 6) check (estimated_cost is null or estimated_cost >= 0);

alter table public.reports
  add column provider text check (provider is null or provider in ('zhipu', 'deepseek')),
  add column input_tokens bigint check (input_tokens is null or input_tokens >= 0),
  add column output_tokens bigint check (output_tokens is null or output_tokens >= 0),
  add column latency_ms integer check (latency_ms is null or latency_ms >= 0),
  add column estimated_cost numeric(14, 6) check (estimated_cost is null or estimated_cost >= 0);

alter table public.publish_packs
  add column provider text check (provider is null or provider in ('zhipu', 'deepseek')),
  add column input_tokens bigint check (input_tokens is null or input_tokens >= 0),
  add column output_tokens bigint check (output_tokens is null or output_tokens >= 0),
  add column latency_ms integer check (latency_ms is null or latency_ms >= 0),
  add column estimated_cost numeric(14, 6) check (estimated_cost is null or estimated_cost >= 0);

comment on table public.judge_case_runs is
  'One immutable provider/model route per TestCase; every Blind Sample score for that case references this run.';

alter table public.judge_case_runs enable row level security;
revoke all on table public.judge_case_runs from public, anon, authenticated;
grant all on table public.judge_case_runs to service_role;
