-- AI Benchmark Studio — initial evidence-first schema.
-- This migration is intentionally not applied to a remote project in M1.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  intent text not null check (char_length(btrim(intent)) between 1 and 4000),
  status text not null default 'draft' check (status in (
    'draft', 'researching', 'research_ready', 'protocol_draft',
    'protocol_locked', 'testing', 'reviewing', 'review_locked',
    'completed', 'reported', 'published'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  normalized_name text not null check (char_length(btrim(normalized_name)) between 1 and 120),
  official_url text,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint products_normalized_name_key unique (normalized_name)
);

create table public.project_products (
  project_id uuid not null references public.projects(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  display_order smallint not null check (display_order between 1 and 3),
  submitted_name text not null check (char_length(btrim(submitted_name)) between 1 and 120),
  submitted_official_url text,
  created_at timestamptz not null default now(),
  primary key (project_id, product_id),
  unique (project_id, display_order)
);

create table public.research_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  version integer not null check (version > 0),
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  model text,
  prompt_version text,
  input_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(input_snapshot) = 'object'),
  input_signature text,
  comparability jsonb check (comparability is null or jsonb_typeof(comparability) = 'object'),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, version),
  unique (id, project_id),
  check (status <> 'completed' or (model is not null and prompt_version is not null and comparability is not null)),
  check (status <> 'failed' or char_length(btrim(coalesce(error_message, ''))) > 0)
);

create table public.product_research (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  research_run_id uuid not null,
  product_id uuid not null,
  positioning text not null,
  target_users jsonb not null default '[]'::jsonb check (jsonb_typeof(target_users) = 'array'),
  capabilities jsonb not null default '[]'::jsonb check (jsonb_typeof(capabilities) = 'array'),
  key_features jsonb not null default '[]'::jsonb check (jsonb_typeof(key_features) = 'array'),
  pricing jsonb check (pricing is null or jsonb_typeof(pricing) = 'object'),
  official_best_practices jsonb not null default '[]'::jsonb check (jsonb_typeof(official_best_practices) = 'array'),
  limitations jsonb not null default '[]'::jsonb check (jsonb_typeof(limitations) = 'array'),
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  created_at timestamptz not null default now(),
  unique (research_run_id, product_id),
  foreign key (research_run_id, project_id) references public.research_runs(id, project_id) on delete restrict,
  foreign key (project_id, product_id) references public.project_products(project_id, product_id) on delete restrict
);

create table public.protocols (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  research_run_id uuid not null,
  version integer not null check (version > 0),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  goal text not null check (char_length(btrim(goal)) > 0),
  status text not null default 'draft' check (status in ('draft', 'locked')),
  test_mode text not null default 'standardized' check (test_mode in ('standardized', 'best_practice', 'mixed')),
  rules jsonb not null default '[]'::jsonb check (jsonb_typeof(rules) = 'array'),
  generation_model text,
  prompt_version text,
  input_signature text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  locked_at timestamptz,
  unique (project_id, version),
  unique (id, project_id),
  foreign key (research_run_id, project_id) references public.research_runs(id, project_id) on delete restrict,
  check ((status = 'draft' and locked_at is null) or (status = 'locked' and locked_at is not null))
);

create table public.test_cases (
  id uuid primary key default gen_random_uuid(),
  protocol_id uuid not null references public.protocols(id) on delete restrict,
  position smallint not null check (position > 0),
  title text not null check (char_length(btrim(title)) > 0),
  objective text not null check (char_length(btrim(objective)) > 0),
  prompt text not null check (char_length(btrim(prompt)) > 0),
  input_description text,
  input_artifacts jsonb not null default '[]'::jsonb check (jsonb_typeof(input_artifacts) = 'array'),
  observation_focus jsonb not null default '[]'::jsonb check (jsonb_typeof(observation_focus) = 'array'),
  execution_rules jsonb not null default '[]'::jsonb check (jsonb_typeof(execution_rules) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (protocol_id, position),
  unique (id, protocol_id)
);

create table public.rubric_dimensions (
  id uuid primary key default gen_random_uuid(),
  protocol_id uuid not null references public.protocols(id) on delete restrict,
  position smallint not null check (position > 0),
  name text not null check (char_length(btrim(name)) > 0),
  weight numeric(5,2) not null check (weight > 0 and weight <= 100),
  description text,
  scoring_standard jsonb not null default '{}'::jsonb check (jsonb_typeof(scoring_standard) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (protocol_id, position),
  unique (protocol_id, name),
  unique (id, protocol_id)
);

create table public.test_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  protocol_id uuid not null,
  test_case_id uuid not null,
  product_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'uploaded', 'invalid', 'ready_for_review')),
  generation_time_seconds integer check (generation_time_seconds is null or generation_time_seconds >= 0),
  retry_count integer not null default 0 check (retry_count >= 0),
  manually_edited boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (protocol_id, test_case_id, product_id),
  unique (id, project_id),
  foreign key (protocol_id, project_id) references public.protocols(id, project_id) on delete restrict,
  foreign key (test_case_id, protocol_id) references public.test_cases(id, protocol_id) on delete restrict,
  foreign key (project_id, product_id) references public.project_products(project_id, product_id) on delete restrict
);

create table public.test_artifacts (
  id uuid primary key default gen_random_uuid(),
  test_run_id uuid not null references public.test_runs(id) on delete restrict,
  kind text not null check (kind in ('image', 'pdf', 'text')),
  bucket_id text not null default 'benchmark-artifacts' check (bucket_id = 'benchmark-artifacts'),
  storage_path text not null check (storage_path ~ '^projects/[0-9a-f-]+/runs/[0-9a-f-]+/[0-9a-f-]+\.[A-Za-z0-9]+$'),
  file_name text not null check (char_length(btrim(file_name)) > 0),
  mime_type text not null check (char_length(btrim(mime_type)) > 0),
  size_bytes bigint not null check (size_bytes >= 0),
  preview_path text,
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (storage_path),
  unique (id, test_run_id)
);

create table public.blind_samples (
  id uuid primary key default gen_random_uuid(),
  protocol_id uuid not null references public.protocols(id) on delete restrict,
  label text not null check (char_length(btrim(label)) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (protocol_id, label),
  unique (id, protocol_id)
);

create table public.blind_mappings (
  blind_sample_id uuid primary key,
  protocol_id uuid not null,
  project_id uuid not null,
  product_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (blind_sample_id, protocol_id) references public.blind_samples(id, protocol_id) on delete restrict,
  foreign key (protocol_id, project_id) references public.protocols(id, project_id) on delete restrict,
  foreign key (project_id, product_id) references public.project_products(project_id, product_id) on delete restrict,
  unique (protocol_id, product_id)
);

create table public.judge_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  protocol_id uuid not null,
  attempt integer not null default 1 check (attempt > 0),
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  model text not null check (char_length(btrim(model)) > 0),
  prompt_version text not null check (char_length(btrim(prompt_version)) > 0),
  input_snapshot jsonb not null check (jsonb_typeof(input_snapshot) = 'object'),
  input_signature text not null check (char_length(btrim(input_signature)) > 0),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (protocol_id, attempt),
  unique (id, protocol_id),
  foreign key (protocol_id, project_id) references public.protocols(id, project_id) on delete restrict,
  check (status <> 'failed' or char_length(btrim(coalesce(error_message, ''))) > 0)
);

create table public.judge_run_artifacts (
  judge_run_id uuid not null references public.judge_runs(id) on delete restrict,
  artifact_id uuid not null references public.test_artifacts(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (judge_run_id, artifact_id)
);

create table public.judge_scores (
  id uuid primary key default gen_random_uuid(),
  judge_run_id uuid not null,
  protocol_id uuid not null,
  test_case_id uuid not null,
  blind_sample_id uuid not null,
  rubric_dimension_id uuid not null,
  ai_score numeric(3,1) not null check (ai_score between 0 and 10 and ai_score * 10 = trunc(ai_score * 10)),
  reason text not null check (char_length(btrim(reason)) > 0),
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  model text not null check (char_length(btrim(model)) > 0),
  prompt_version text not null check (char_length(btrim(prompt_version)) > 0),
  created_at timestamptz not null default now(),
  unique (judge_run_id, test_case_id, blind_sample_id, rubric_dimension_id),
  unique (id, judge_run_id),
  foreign key (judge_run_id, protocol_id) references public.judge_runs(id, protocol_id) on delete restrict,
  foreign key (test_case_id, protocol_id) references public.test_cases(id, protocol_id) on delete restrict,
  foreign key (blind_sample_id, protocol_id) references public.blind_samples(id, protocol_id) on delete restrict,
  foreign key (rubric_dimension_id, protocol_id) references public.rubric_dimensions(id, protocol_id) on delete restrict
);

create table public.review_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  protocol_id uuid not null,
  judge_run_id uuid not null,
  status text not null default 'reviewing' check (status in ('reviewing', 'locked', 'revealed')),
  locked_at timestamptz,
  revealed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (judge_run_id),
  unique (id, project_id, protocol_id, judge_run_id),
  foreign key (judge_run_id, protocol_id) references public.judge_runs(id, protocol_id) on delete restrict,
  foreign key (protocol_id, project_id) references public.protocols(id, project_id) on delete restrict,
  check ((status = 'reviewing' and locked_at is null and revealed_at is null)
    or (status = 'locked' and locked_at is not null and revealed_at is null)
    or (status = 'revealed' and locked_at is not null and revealed_at is not null))
);

create table public.human_review_events (
  id uuid primary key default gen_random_uuid(),
  event_sequence bigint generated always as identity unique,
  score_revision integer not null default 0 check (score_revision > 0),
  review_session_id uuid not null references public.review_sessions(id) on delete restrict,
  judge_score_id uuid not null,
  action text not null check (action in ('override', 'revert')),
  override_score numeric(3,1),
  reason text,
  target_event_id uuid references public.human_review_events(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (judge_score_id) references public.judge_scores(id) on delete restrict,
  unique (review_session_id, judge_score_id, score_revision),
  check (
    (action = 'override' and override_score is not null and override_score between 0 and 10
      and override_score * 10 = trunc(override_score * 10)
      and char_length(btrim(coalesce(reason, ''))) > 0 and target_event_id is null)
    or
    (action = 'revert' and override_score is null and target_event_id is not null)
  )
);

create table public.result_analyses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  protocol_id uuid not null,
  review_session_id uuid not null,
  judge_run_id uuid not null,
  attempt integer not null default 1 check (attempt > 0),
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  final_score_signature text not null check (char_length(btrim(final_score_signature)) > 0),
  input_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(input_snapshot) = 'object'),
  winner_product_id uuid,
  output jsonb check (output is null or jsonb_typeof(output) = 'object'),
  model text,
  prompt_version text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (review_session_id, final_score_signature, attempt),
  unique (id, project_id),
  foreign key (review_session_id, project_id, protocol_id, judge_run_id)
    references public.review_sessions(id, project_id, protocol_id, judge_run_id) on delete restrict,
  foreign key (project_id, winner_product_id)
    references public.project_products(project_id, product_id) on delete restrict,
  check (status <> 'completed' or (output is not null and model is not null and prompt_version is not null)),
  check (status <> 'failed' or char_length(btrim(coalesce(error_message, ''))) > 0)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  result_analysis_id uuid not null,
  version integer not null default 1 check (version > 0),
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  content jsonb check (content is null or jsonb_typeof(content) = 'object'),
  model text,
  prompt_version text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (result_analysis_id, version),
  unique (id, project_id),
  foreign key (result_analysis_id, project_id) references public.result_analyses(id, project_id) on delete restrict,
  check (status <> 'completed' or (content is not null and model is not null and prompt_version is not null)),
  check (status <> 'failed' or char_length(btrim(coalesce(error_message, ''))) > 0)
);

create table public.report_artifacts (
  report_id uuid not null references public.reports(id) on delete restrict,
  artifact_id uuid not null references public.test_artifacts(id) on delete restrict,
  evidence_role text not null default 'case_output' check (evidence_role in ('case_output', 'score_evidence', 'comparison')),
  caption text,
  created_at timestamptz not null default now(),
  primary key (report_id, artifact_id)
);

create table public.publish_packs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  report_id uuid not null,
  version integer not null default 1 check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'discovering', 'generating', 'ready', 'failed')),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  content_ideas jsonb not null default '[]'::jsonb check (jsonb_typeof(content_ideas) = 'array'),
  selected_idea jsonb check (selected_idea is null or jsonb_typeof(selected_idea) = 'object'),
  community_post jsonb check (community_post is null or jsonb_typeof(community_post) = 'object'),
  model text,
  prompt_version text,
  input_signature text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (report_id, version),
  unique (id, project_id),
  foreign key (report_id, project_id) references public.reports(id, project_id) on delete restrict,
  check (status <> 'ready' or (community_post is not null and model is not null and prompt_version is not null)),
  check (status <> 'failed' or char_length(btrim(coalesce(error_message, ''))) > 0)
);

create table public.publish_pack_artifacts (
  publish_pack_id uuid not null references public.publish_packs(id) on delete restrict,
  artifact_id uuid not null references public.test_artifacts(id) on delete restrict,
  display_order smallint not null check (display_order between 1 and 9),
  reason text not null check (char_length(btrim(reason)) > 0),
  supports_claim text,
  supports_paragraph integer check (supports_paragraph is null or supports_paragraph > 0),
  created_at timestamptz not null default now(),
  primary key (publish_pack_id, artifact_id),
  unique (publish_pack_id, display_order)
);

create index projects_owner_active_idx on public.projects(owner_id, updated_at desc) where deleted_at is null;
create index project_products_product_idx on public.project_products(product_id);
create index research_runs_project_status_idx on public.research_runs(project_id, status, created_at desc);
create index product_research_product_idx on public.product_research(product_id);
create index protocols_project_status_idx on public.protocols(project_id, status, version desc);
create index test_cases_protocol_idx on public.test_cases(protocol_id, position);
create index rubric_dimensions_protocol_idx on public.rubric_dimensions(protocol_id, position);
create index test_runs_project_status_idx on public.test_runs(project_id, status);
create index test_runs_protocol_product_idx on public.test_runs(protocol_id, product_id);
create index test_artifacts_run_idx on public.test_artifacts(test_run_id, created_at);
create index blind_samples_protocol_idx on public.blind_samples(protocol_id);
create index blind_mappings_project_idx on public.blind_mappings(project_id);
create index judge_runs_project_status_idx on public.judge_runs(project_id, status, created_at desc);
create index judge_run_artifacts_artifact_idx on public.judge_run_artifacts(artifact_id);
create index judge_scores_review_idx on public.judge_scores(judge_run_id, blind_sample_id, test_case_id);
create index human_review_events_score_idx on public.human_review_events(review_session_id, judge_score_id, score_revision desc);
create index result_analyses_project_idx on public.result_analyses(project_id, created_at desc);
create index reports_project_idx on public.reports(project_id, created_at desc);
create index report_artifacts_artifact_idx on public.report_artifacts(artifact_id);
create index publish_packs_project_idx on public.publish_packs(project_id, created_at desc);
create index publish_pack_artifacts_artifact_idx on public.publish_pack_artifacts(artifact_id);

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger projects_set_updated_at before update on public.projects
for each row execute function private.set_updated_at();
create trigger products_set_updated_at before update on public.products
for each row execute function private.set_updated_at();
create trigger research_runs_set_updated_at before update on public.research_runs
for each row execute function private.set_updated_at();
create trigger protocols_set_updated_at before update on public.protocols
for each row execute function private.set_updated_at();
create trigger test_cases_set_updated_at before update on public.test_cases
for each row execute function private.set_updated_at();
create trigger rubric_dimensions_set_updated_at before update on public.rubric_dimensions
for each row execute function private.set_updated_at();
create trigger test_runs_set_updated_at before update on public.test_runs
for each row execute function private.set_updated_at();
create trigger judge_runs_set_updated_at before update on public.judge_runs
for each row execute function private.set_updated_at();
create trigger review_sessions_set_updated_at before update on public.review_sessions
for each row execute function private.set_updated_at();
create trigger result_analyses_set_updated_at before update on public.result_analyses
for each row execute function private.set_updated_at();
create trigger reports_set_updated_at before update on public.reports
for each row execute function private.set_updated_at();
create trigger publish_packs_set_updated_at before update on public.publish_packs
for each row execute function private.set_updated_at();

create function private.validate_research_run_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  selected_product_count integer;
  researched_product_count integer;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      raise exception 'A research run must start as pending';
    end if;
    return new;
  end if;
  if row(old.project_id, old.version, old.input_snapshot, old.input_signature)
    is distinct from row(new.project_id, new.version, new.input_snapshot, new.input_signature) then
    raise exception 'Research run inputs are immutable';
  end if;
  if old.status in ('completed', 'failed') then
    raise exception 'Terminal research run % is immutable; create a new version to retry', old.id;
  end if;
  if not ((old.status = 'pending' and new.status in ('running', 'failed'))
    or (old.status = 'running' and new.status in ('completed', 'failed'))
    or old.status = new.status) then
    raise exception 'Invalid research run status transition: % -> %', old.status, new.status;
  end if;
  if new.status = 'completed' then
    select count(*) into selected_product_count
      from public.project_products where project_id = new.project_id;
    select count(*) into researched_product_count
      from public.product_research where research_run_id = new.id;
    if selected_product_count = 0 or selected_product_count <> researched_product_count then
      raise exception 'Completed research must contain every selected project product';
    end if;
    new.completed_at := coalesce(new.completed_at, now());
  end if;
  return new;
end;
$$;

create trigger research_runs_validate_transition before insert or update on public.research_runs
for each row execute function private.validate_research_run_transition();

create function private.protect_terminal_research_output()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_run_id uuid;
begin
  if tg_op = 'INSERT' then target_run_id := new.research_run_id; else target_run_id := old.research_run_id; end if;
  if exists (
    select 1 from public.research_runs
    where id = target_run_id and status in ('completed', 'failed')
  ) then
    raise exception 'Output of a terminal research run is immutable';
  end if;
  if tg_op = 'UPDATE' and new.research_run_id <> old.research_run_id then
    raise exception 'Product research cannot move between runs';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger product_research_protect_terminal_run
before insert or update or delete on public.product_research
for each row execute function private.protect_terminal_research_output();

create function private.validate_protocol_lock()
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
    select 1 from public.research_runs
    where id = new.research_run_id and project_id = new.project_id
      and status = 'completed'
      and comparability->>'status' in ('comparable', 'partially_comparable')
  ) then
    raise exception 'Protocol requires completed and comparable research';
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

create trigger protocols_validate_lock before insert or update or delete on public.protocols
for each row execute function private.validate_protocol_lock();

create function private.protect_locked_protocol_child()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  old_protocol_id uuid;
  new_protocol_id uuid;
begin
  if tg_op <> 'INSERT' then old_protocol_id := old.protocol_id; end if;
  if tg_op <> 'DELETE' then new_protocol_id := new.protocol_id; end if;

  if (old_protocol_id is not null and exists (
      select 1 from public.protocols where id = old_protocol_id and status = 'locked'
    )) or (new_protocol_id is not null and exists (
      select 1 from public.protocols where id = new_protocol_id and status = 'locked'
    )) then
    raise exception 'Test cases and rubric dimensions of a locked protocol are immutable';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger test_cases_protect_locked_protocol
before insert or update or delete on public.test_cases
for each row execute function private.protect_locked_protocol_child();
create trigger rubric_dimensions_protect_locked_protocol
before insert or update or delete on public.rubric_dimensions
for each row execute function private.protect_locked_protocol_child();

create function private.require_locked_protocol_for_test_run()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.protocols
    where id = new.protocol_id and project_id = new.project_id and status = 'locked'
  ) then
    raise exception 'Test runs require the selected locked protocol';
  end if;
  return new;
end;
$$;

create trigger test_runs_require_locked_protocol
before insert on public.test_runs
for each row execute function private.require_locked_protocol_for_test_run();

create function private.prevent_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% records are append-only and cannot be updated or deleted', tg_table_name;
end;
$$;

create trigger test_artifacts_are_immutable before update or delete on public.test_artifacts
for each row execute function private.prevent_mutation();
create trigger blind_samples_are_immutable before update or delete on public.blind_samples
for each row execute function private.prevent_mutation();
create trigger blind_mappings_are_immutable before update or delete on public.blind_mappings
for each row execute function private.prevent_mutation();
create trigger judge_run_artifacts_are_immutable before update or delete on public.judge_run_artifacts
for each row execute function private.prevent_mutation();
create trigger judge_scores_are_immutable before update or delete on public.judge_scores
for each row execute function private.prevent_mutation();
create trigger human_review_events_are_append_only before update or delete on public.human_review_events
for each row execute function private.prevent_mutation();

create function private.protect_judged_test_run()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.test_artifacts ta
    join public.judge_run_artifacts jra on jra.artifact_id = ta.id
    where ta.test_run_id = old.id
  ) then
    raise exception 'A TestRun used by a JudgeRun is immutable';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger test_runs_protect_judged_evidence before update or delete on public.test_runs
for each row execute function private.protect_judged_test_run();

create function private.validate_judge_run_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  product_count integer;
  sample_count integer;
  mapping_count integer;
  expected_test_count integer;
  actual_test_count integer;
  expected_score_count integer;
  actual_score_count integer;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      raise exception 'A judge run must start as pending';
    end if;
    if not exists (
      select 1 from public.protocols
      where id = new.protocol_id and project_id = new.project_id and status = 'locked'
    ) then
      raise exception 'Judge runs require a locked protocol';
    end if;
    select count(*) into product_count
      from public.project_products where project_id = new.project_id;
    select count(*) into sample_count
      from public.blind_samples where protocol_id = new.protocol_id;
    select count(*) into mapping_count
      from public.blind_mappings where protocol_id = new.protocol_id;
    if product_count = 0 or product_count <> sample_count or sample_count <> mapping_count then
      raise exception 'Blind samples and server mappings must cover every project product';
    end if;
    return new;
  end if;
  if row(old.project_id, old.protocol_id, old.attempt, old.model, old.prompt_version, old.input_snapshot, old.input_signature)
    is distinct from row(new.project_id, new.protocol_id, new.attempt, new.model, new.prompt_version, new.input_snapshot, new.input_signature) then
    raise exception 'Judge run inputs are immutable';
  end if;
  if old.status = 'completed' or old.status = 'failed' then
    raise exception 'Terminal judge run % is immutable', old.id;
  end if;
  if not ((old.status = 'pending' and new.status in ('running', 'failed'))
    or (old.status = 'running' and new.status in ('completed', 'failed'))
    or old.status = new.status) then
    raise exception 'Invalid judge run status transition: % -> %', old.status, new.status;
  end if;
  if old.status = 'pending' and new.status = 'running' then
    select
      (select count(*) from public.test_cases where protocol_id = new.protocol_id)
      * (select count(*) from public.project_products where project_id = new.project_id)
      into expected_test_count;
    select count(*) into actual_test_count
      from public.test_runs where protocol_id = new.protocol_id;
    if expected_test_count = 0 or actual_test_count <> expected_test_count then
      raise exception 'Judge run requires the complete Product × TestCase matrix';
    end if;
  end if;
  if old.status = 'pending' and new.status = 'running' and (
    exists (
      select 1 from public.test_runs tr
      where tr.protocol_id = new.protocol_id and tr.status <> 'ready_for_review'
    )
    or exists (
      select 1 from public.test_runs tr
      where tr.protocol_id = new.protocol_id
        and not exists (
          select 1
          from public.test_artifacts ta
          join public.judge_run_artifacts jra on jra.artifact_id = ta.id
          where ta.test_run_id = tr.id and jra.judge_run_id = new.id
        )
    )
  ) then
    raise exception 'Judge run cannot start until every TestRun is ready with linked evidence';
  end if;
  if new.status = 'completed' then new.completed_at := coalesce(new.completed_at, now()); end if;
  if new.status = 'completed' then
    select
      (select count(*) from public.test_cases where protocol_id = new.protocol_id)
      * (select count(*) from public.blind_samples where protocol_id = new.protocol_id)
      * (select count(*) from public.rubric_dimensions where protocol_id = new.protocol_id)
      into expected_score_count;
    select count(*) into actual_score_count
      from public.judge_scores where judge_run_id = new.id;
    if expected_score_count = 0 or actual_score_count <> expected_score_count then
      raise exception 'Completed JudgeRun must contain the full Case × Sample × Rubric score matrix';
    end if;
  end if;
  return new;
end;
$$;

create trigger judge_runs_validate_transition before insert or update on public.judge_runs
for each row execute function private.validate_judge_run_transition();

create function private.validate_judge_score_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.judge_runs
    where id = new.judge_run_id and protocol_id = new.protocol_id and status = 'running'
  ) then
    raise exception 'Judge scores can only be appended to a running judge run';
  end if;
  return new;
end;
$$;

create trigger judge_scores_validate_insert before insert on public.judge_scores
for each row execute function private.validate_judge_score_insert();

create function private.validate_review_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'reviewing' then
      raise exception 'A review session must start as reviewing';
    end if;
    if not exists (
      select 1 from public.judge_runs
      where id = new.judge_run_id and protocol_id = new.protocol_id
        and project_id = new.project_id and status = 'completed'
    ) then
      raise exception 'Review sessions require a completed judge run';
    end if;
    return new;
  end if;
  if row(old.project_id, old.protocol_id, old.judge_run_id)
    is distinct from row(new.project_id, new.protocol_id, new.judge_run_id) then
    raise exception 'Review session source is immutable';
  end if;
  if old.status = new.status then return new; end if;
  if old.status = 'reviewing' and new.status = 'locked' then
    new.locked_at := coalesce(new.locked_at, now());
    return new;
  end if;
  if old.status = 'locked' and new.status = 'revealed' then
    new.revealed_at := coalesce(new.revealed_at, now());
    return new;
  end if;
  raise exception 'Invalid review status transition: % -> %', old.status, new.status;
end;
$$;

create trigger review_sessions_validate_transition before insert or update on public.review_sessions
for each row execute function private.validate_review_transition();

create function private.validate_human_review_event()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  session_judge_run_id uuid;
  latest_event public.human_review_events%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.review_session_id::text || ':' || new.judge_score_id::text, 0)
  );
  select judge_run_id into session_judge_run_id
    from public.review_sessions
    where id = new.review_session_id and status = 'reviewing'
    for share;
  if session_judge_run_id is null then
    raise exception 'Human review events are only allowed while the session is reviewing';
  end if;
  if not exists (
    select 1 from public.judge_scores
    where id = new.judge_score_id and judge_run_id = session_judge_run_id
  ) then
    raise exception 'Judge score does not belong to this review session';
  end if;

  select * into latest_event
    from public.human_review_events
    where review_session_id = new.review_session_id and judge_score_id = new.judge_score_id
    order by score_revision desc
    limit 1;

  if new.action = 'revert' and (
    latest_event.id is null or latest_event.action <> 'override' or new.target_event_id <> latest_event.id
  ) then
    raise exception 'Revert must target the current active override';
  end if;
  new.score_revision := coalesce(latest_event.score_revision, 0) + 1;
  return new;
end;
$$;

create trigger human_review_events_validate_insert before insert on public.human_review_events
for each row execute function private.validate_human_review_event();

create view public.review_final_scores
with (security_invoker = true)
as
with latest_event as (
  select distinct on (review_session_id, judge_score_id)
    review_session_id,
    judge_score_id,
    action,
    override_score,
    id as human_review_event_id
  from public.human_review_events
  order by review_session_id, judge_score_id, score_revision desc
)
select
  rs.id as review_session_id,
  js.id as judge_score_id,
  js.test_case_id,
  js.blind_sample_id,
  js.rubric_dimension_id,
  js.ai_score,
  case when le.action = 'override' then le.override_score else js.ai_score end as final_score,
  case when le.action = 'override' then le.human_review_event_id end as active_override_event_id
from public.review_sessions rs
join public.judge_scores js on js.judge_run_id = rs.judge_run_id
left join latest_event le on le.review_session_id = rs.id and le.judge_score_id = js.id;

create function private.final_score_signature(target_review_session_id uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select encode(
    extensions.digest(
      coalesce(string_agg(
        judge_score_id::text || ':' || to_char(final_score, 'FM999990.0'),
        ',' order by judge_score_id
      ), ''),
      'sha256'
    ),
    'hex'
  )
  from public.review_final_scores
  where review_session_id = target_review_session_id;
$$;

create function private.validate_result_analysis_source()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  current_signature text;
begin
  if not exists (
    select 1 from public.review_sessions
    where id = new.review_session_id and status = 'revealed'
  ) then
    raise exception 'Result analysis requires a revealed review session';
  end if;
  current_signature := private.final_score_signature(new.review_session_id);
  if new.final_score_signature <> current_signature then
    raise exception 'Result analysis final score signature is stale or invalid';
  end if;
  if tg_op = 'UPDATE' and row(old.project_id, old.protocol_id, old.review_session_id, old.judge_run_id, old.attempt, old.final_score_signature, old.input_snapshot)
    is distinct from row(new.project_id, new.protocol_id, new.review_session_id, new.judge_run_id, new.attempt, new.final_score_signature, new.input_snapshot) then
    raise exception 'Result analysis source is immutable';
  end if;
  return new;
end;
$$;

create trigger result_analyses_validate_source before insert or update on public.result_analyses
for each row execute function private.validate_result_analysis_source();

create function private.validate_generated_output_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      raise exception '% must start as pending', tg_table_name;
    end if;
    return new;
  end if;
  if old.status in ('completed', 'failed') then
    raise exception 'Terminal % record % is immutable; create a new version/run', tg_table_name, old.id;
  end if;
  if not ((old.status = 'pending' and new.status in ('running', 'failed'))
    or (old.status = 'running' and new.status in ('completed', 'failed'))
    or old.status = new.status) then
    raise exception 'Invalid % status transition: % -> %', tg_table_name, old.status, new.status;
  end if;
  if new.status = 'completed' then
    new.completed_at := coalesce(new.completed_at, now());
    if tg_table_name = 'reports' and not exists (
      select 1 from public.report_artifacts where report_id = new.id
    ) then
      raise exception 'A completed Report must retain at least one Artifact evidence link';
    end if;
  end if;
  return new;
end;
$$;

create trigger result_analyses_validate_transition
before insert or update on public.result_analyses
for each row execute function private.validate_generated_output_transition();

create function private.validate_report_source()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  source_review_session_id uuid;
  source_signature text;
begin
  select review_session_id, final_score_signature
    into source_review_session_id, source_signature
    from public.result_analyses
    where id = new.result_analysis_id
      and project_id = new.project_id
      and status = 'completed';
  if source_review_session_id is null then
    raise exception 'Reports require a completed Final Result Analysis';
  end if;
  if source_signature <> private.final_score_signature(source_review_session_id) then
    raise exception 'Report source analysis is stale';
  end if;
  if tg_op = 'UPDATE' and row(old.project_id, old.result_analysis_id, old.version)
    is distinct from row(new.project_id, new.result_analysis_id, new.version) then
    raise exception 'Report source is immutable';
  end if;
  return new;
end;
$$;

create trigger reports_validate_source before insert or update on public.reports
for each row execute function private.validate_report_source();

create trigger reports_validate_transition before insert or update on public.reports
for each row execute function private.validate_generated_output_transition();

create function private.validate_report_artifact_relation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.reports r
    join public.result_analyses ra on ra.id = r.result_analysis_id
    join public.test_artifacts ta on ta.id = new.artifact_id
    join public.test_runs tr on tr.id = ta.test_run_id
    where r.id = new.report_id
      and tr.project_id = r.project_id
      and tr.protocol_id = ra.protocol_id
  ) then
    raise exception 'Report evidence must reference a TestArtifact from its analyzed Protocol';
  end if;
  return new;
end;
$$;

create trigger report_artifacts_validate_insert before insert on public.report_artifacts
for each row execute function private.validate_report_artifact_relation();

create function private.protect_completed_report_artifacts()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  old_report_id uuid;
  new_report_id uuid;
begin
  if tg_op <> 'INSERT' then old_report_id := old.report_id; end if;
  if tg_op <> 'DELETE' then new_report_id := new.report_id; end if;
  if (old_report_id is not null and exists (
      select 1 from public.reports where id = old_report_id and status = 'completed'
    )) or (new_report_id is not null and exists (
      select 1 from public.reports where id = new_report_id and status = 'completed'
    )) then
    raise exception 'Evidence links of a completed Report are immutable';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger report_artifacts_protect_completed
before insert or update or delete on public.report_artifacts
for each row execute function private.protect_completed_report_artifacts();

create function private.validate_publish_pack_source()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.reports
    where id = new.report_id and project_id = new.project_id and status = 'completed'
  ) then
    raise exception 'Publish packs require a completed report';
  end if;
  if tg_op = 'UPDATE' and row(old.project_id, old.report_id, old.version)
    is distinct from row(new.project_id, new.report_id, new.version) then
    raise exception 'Publish pack source is immutable';
  end if;
  return new;
end;
$$;

create trigger publish_packs_validate_source before insert or update on public.publish_packs
for each row execute function private.validate_publish_pack_source();

create function private.validate_publish_pack_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'A PublishPack must start as draft'; end if;
    return new;
  end if;
  if old.status in ('ready', 'failed') then
    raise exception 'Terminal PublishPack % is immutable; create a new version to regenerate', old.id;
  end if;
  if not ((old.status = 'draft' and new.status in ('discovering', 'failed'))
    or (old.status = 'discovering' and new.status in ('generating', 'failed'))
    or (old.status = 'generating' and new.status in ('ready', 'failed'))
    or old.status = new.status) then
    raise exception 'Invalid PublishPack status transition: % -> %', old.status, new.status;
  end if;
  if new.status = 'ready' then
    if not exists (select 1 from public.publish_pack_artifacts where publish_pack_id = new.id) then
      raise exception 'A ready PublishPack must retain at least one screenshot Artifact';
    end if;
    new.completed_at := coalesce(new.completed_at, now());
  end if;
  return new;
end;
$$;

create trigger publish_packs_validate_transition
before insert or update on public.publish_packs
for each row execute function private.validate_publish_pack_transition();

create function private.validate_judge_artifact_relation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.judge_runs jr
    join public.test_artifacts ta on ta.id = new.artifact_id
    join public.test_runs tr on tr.id = ta.test_run_id
    where jr.id = new.judge_run_id
      and tr.project_id = jr.project_id
      and tr.protocol_id = jr.protocol_id
  ) then
    raise exception 'Judge artifact must belong to the same project and protocol';
  end if;
  return new;
end;
$$;

create trigger judge_run_artifacts_validate_insert before insert on public.judge_run_artifacts
for each row execute function private.validate_judge_artifact_relation();

create function private.validate_publish_artifact_relation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.publish_packs pp
    join public.reports r on r.id = pp.report_id
    join public.result_analyses ra on ra.id = r.result_analysis_id
    join public.test_artifacts ta on ta.id = new.artifact_id
    join public.test_runs tr on tr.id = ta.test_run_id
    where pp.id = new.publish_pack_id
      and tr.project_id = pp.project_id
      and tr.protocol_id = ra.protocol_id
      and ta.kind = 'image'
  ) then
    raise exception 'Publish screenshot must reference an image TestArtifact from the analyzed Protocol';
  end if;
  return new;
end;
$$;

create trigger publish_pack_artifacts_validate_insert before insert on public.publish_pack_artifacts
for each row execute function private.validate_publish_artifact_relation();

create function private.protect_ready_publish_artifacts()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  old_pack_id uuid;
  new_pack_id uuid;
begin
  if tg_op <> 'INSERT' then old_pack_id := old.publish_pack_id; end if;
  if tg_op <> 'DELETE' then new_pack_id := new.publish_pack_id; end if;
  if (old_pack_id is not null and exists (
      select 1 from public.publish_packs where id = old_pack_id and status = 'ready'
    )) or (new_pack_id is not null and exists (
      select 1 from public.publish_packs where id = new_pack_id and status = 'ready'
    )) then
    raise exception 'Artifacts of a ready PublishPack are immutable';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger publish_pack_artifacts_protect_ready
before insert or update or delete on public.publish_pack_artifacts
for each row execute function private.protect_ready_publish_artifacts();

create function private.is_project_owner(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.projects
    where id = target_project_id
      and owner_id = (select auth.uid())
      and deleted_at is null
  );
$$;

revoke all on function private.is_project_owner(uuid) from public, anon;
revoke execute on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_project_owner(uuid) to authenticated;

alter table public.projects enable row level security;
alter table public.products enable row level security;
alter table public.project_products enable row level security;
alter table public.research_runs enable row level security;
alter table public.product_research enable row level security;
alter table public.protocols enable row level security;
alter table public.test_cases enable row level security;
alter table public.rubric_dimensions enable row level security;
alter table public.test_runs enable row level security;
alter table public.test_artifacts enable row level security;
alter table public.blind_samples enable row level security;
alter table public.blind_mappings enable row level security;
alter table public.judge_runs enable row level security;
alter table public.judge_run_artifacts enable row level security;
alter table public.judge_scores enable row level security;
alter table public.review_sessions enable row level security;
alter table public.human_review_events enable row level security;
alter table public.result_analyses enable row level security;
alter table public.reports enable row level security;
alter table public.report_artifacts enable row level security;
alter table public.publish_packs enable row level security;
alter table public.publish_pack_artifacts enable row level security;

create policy projects_owner_select on public.projects for select to authenticated
using (owner_id = (select auth.uid()) and deleted_at is null);
create policy products_for_owned_projects_select on public.products for select to authenticated
using (exists (
  select 1 from public.project_products pp
  where pp.product_id = products.id and private.is_project_owner(pp.project_id)
));
create policy project_products_owner_select on public.project_products for select to authenticated
using (private.is_project_owner(project_id));
create policy research_runs_owner_select on public.research_runs for select to authenticated
using (private.is_project_owner(project_id));
create policy product_research_owner_select on public.product_research for select to authenticated
using (private.is_project_owner(project_id));
create policy protocols_owner_select on public.protocols for select to authenticated
using (private.is_project_owner(project_id));
create policy test_cases_owner_select on public.test_cases for select to authenticated
using (exists (select 1 from public.protocols p where p.id = test_cases.protocol_id and private.is_project_owner(p.project_id)));
create policy rubric_dimensions_owner_select on public.rubric_dimensions for select to authenticated
using (exists (select 1 from public.protocols p where p.id = rubric_dimensions.protocol_id and private.is_project_owner(p.project_id)));
create policy test_runs_owner_select on public.test_runs for select to authenticated
using (private.is_project_owner(project_id));
-- Deliberately no direct client policy on test_artifacts. Artifact access is
-- mediated by server routes so review responses cannot be correlated to products.
create policy blind_samples_owner_select on public.blind_samples for select to authenticated
using (exists (select 1 from public.protocols p where p.id = blind_samples.protocol_id and private.is_project_owner(p.project_id)));
-- Deliberately no policy on blind_mappings. Only trusted server code may read it.
-- Judge run snapshots and JudgeRun-to-Artifact links are server-only because
-- they could allow a client to reconstruct the hidden identity mapping.
create policy judge_scores_owner_select on public.judge_scores for select to authenticated
using (exists (select 1 from public.protocols p where p.id = judge_scores.protocol_id and private.is_project_owner(p.project_id)));
create policy review_sessions_owner_select on public.review_sessions for select to authenticated
using (private.is_project_owner(project_id));
create policy human_review_events_owner_select on public.human_review_events for select to authenticated
using (exists (select 1 from public.review_sessions rs where rs.id = human_review_events.review_session_id and private.is_project_owner(rs.project_id)));
create policy result_analyses_owner_select on public.result_analyses for select to authenticated
using (private.is_project_owner(project_id));
create policy reports_owner_select on public.reports for select to authenticated
using (private.is_project_owner(project_id));
create policy publish_packs_owner_select on public.publish_packs for select to authenticated
using (private.is_project_owner(project_id));
-- Publish artifact metadata is also returned through a server projection after reveal.

revoke all on table
  public.projects, public.products, public.project_products, public.research_runs,
  public.product_research, public.protocols, public.test_cases, public.rubric_dimensions,
  public.test_runs, public.test_artifacts, public.blind_samples, public.blind_mappings,
  public.judge_runs, public.judge_run_artifacts, public.judge_scores, public.review_sessions,
  public.human_review_events, public.result_analyses, public.reports, public.report_artifacts, public.publish_packs,
  public.publish_pack_artifacts
from public, anon, authenticated;

grant select on table
  public.projects, public.products, public.project_products, public.research_runs,
  public.product_research, public.protocols, public.test_cases, public.rubric_dimensions,
  public.test_runs, public.blind_samples,
  public.judge_scores, public.review_sessions,
  public.human_review_events, public.result_analyses, public.reports, public.publish_packs
to authenticated;

revoke all on table public.blind_mappings from public, anon, authenticated;
revoke all on table public.review_final_scores from public, anon, authenticated;
grant select on table public.review_final_scores to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'benchmark-artifacts',
  'benchmark-artifacts',
  false,
  52428800,
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/plain']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Deliberately no authenticated/anon policy on storage.objects for this bucket.
-- M6 will issue short-lived signed URLs from trusted server code after applying
-- project and blind-state checks. The service-role key must remain server-only.

comment on table public.blind_mappings is
  'Server-only product identity mapping. Never grant ordinary client SELECT before or after reveal.';
comment on table public.judge_scores is
  'Immutable AI Judge output. Human changes are separate append-only events.';
comment on table public.human_review_events is
  'Append-only override/revert audit log. Latest event determines whether AI score is overridden.';
comment on view public.review_final_scores is
  'Single Final Score source of truth: current override when active, otherwise immutable AI score.';
