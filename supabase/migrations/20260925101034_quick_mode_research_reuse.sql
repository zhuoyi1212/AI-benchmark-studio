-- Project-level workflow mode and reusable, versioned product research snapshots.
-- Existing project-scoped ProductResearch remains the protocol source of truth;
-- snapshot_id records exactly which reusable product facts that run consumed.

alter table public.projects
  add column evaluation_mode text not null default 'quick'
  check (evaluation_mode in ('quick', 'professional')),
  add column quick_preparation_status text not null default 'idle'
  check (quick_preparation_status in ('idle', 'running', 'completed', 'failed')),
  add column quick_preparation_error text;

alter table public.product_research
  add column input_formats jsonb not null default '[]'::jsonb
    check (jsonb_typeof(input_formats) = 'array'),
  add column output_formats jsonb not null default '[]'::jsonb
    check (jsonb_typeof(output_formats) = 'array');

create table public.product_research_snapshots (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  version integer not null check (version > 0),
  origin_project_id uuid not null references public.projects(id) on delete restrict,
  origin_research_run_id uuid not null references public.research_runs(id) on delete restrict,
  origin_product_research_id uuid unique references public.product_research(id) on delete restrict,
  positioning text not null,
  target_users jsonb not null default '[]'::jsonb check (jsonb_typeof(target_users) = 'array'),
  capabilities jsonb not null default '[]'::jsonb check (jsonb_typeof(capabilities) = 'array'),
  key_features jsonb not null default '[]'::jsonb check (jsonb_typeof(key_features) = 'array'),
  pricing jsonb check (pricing is null or jsonb_typeof(pricing) = 'object'),
  official_best_practices jsonb not null default '[]'::jsonb check (jsonb_typeof(official_best_practices) = 'array'),
  limitations jsonb not null default '[]'::jsonb check (jsonb_typeof(limitations) = 'array'),
  input_formats jsonb not null default '[]'::jsonb check (jsonb_typeof(input_formats) = 'array'),
  output_formats jsonb not null default '[]'::jsonb check (jsonb_typeof(output_formats) = 'array'),
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array' and jsonb_array_length(sources) > 0),
  search_provider text not null check (search_provider in ('zhipu', 'deepseek')),
  search_model text not null check (char_length(btrim(search_model)) > 0),
  search_prompt_version text not null check (char_length(btrim(search_prompt_version)) > 0),
  synthesis_provider text not null check (synthesis_provider in ('zhipu', 'deepseek')),
  synthesis_model text not null check (char_length(btrim(synthesis_model)) > 0),
  synthesis_prompt_version text not null check (char_length(btrim(synthesis_prompt_version)) > 0),
  input_signature text not null check (char_length(btrim(input_signature)) > 0),
  researched_at timestamptz not null,
  valid_until timestamptz not null,
  created_at timestamptz not null default now(),
  unique (product_id, version),
  check (valid_until > researched_at)
);

alter table public.product_research
  add column snapshot_id uuid references public.product_research_snapshots(id) on delete restrict,
  add column reused_from_snapshot boolean not null default false;

alter table public.research_runs
  add column reuse_details jsonb not null default '{}'::jsonb
  check (jsonb_typeof(reuse_details) = 'object');

create index product_research_snapshots_latest_idx
  on public.product_research_snapshots(product_id, version desc);
create index product_research_snapshots_validity_idx
  on public.product_research_snapshots(product_id, valid_until desc);
create index product_research_snapshot_reference_idx
  on public.product_research(snapshot_id) where snapshot_id is not null;
create index projects_evaluation_mode_idx
  on public.projects(evaluation_mode) where deleted_at is null;

alter table public.product_research_snapshots enable row level security;
revoke all on table public.product_research_snapshots from public, anon, authenticated;
grant all on table public.product_research_snapshots to service_role;

-- Register historical completed ProductResearch rows without changing them.
with historical as (
  select
    pr.*,
    rr.provider,
    rr.model,
    rr.prompt_version,
    rr.search_provider,
    rr.search_model,
    rr.search_prompt_version,
    rr.input_signature,
    coalesce(rr.completed_at, pr.created_at) as researched_at,
    row_number() over (partition by pr.product_id order by pr.created_at, pr.id) as snapshot_version
  from public.product_research pr
  join public.research_runs rr on rr.id = pr.research_run_id and rr.status = 'completed'
  where rr.provider is not null
    and rr.model is not null
    and rr.prompt_version is not null
    and rr.search_provider is not null
    and rr.search_model is not null
    and rr.search_prompt_version is not null
    and rr.input_signature is not null
)
insert into public.product_research_snapshots (
  product_id, version, origin_project_id, origin_research_run_id, origin_product_research_id,
  positioning, target_users, capabilities, key_features, pricing, official_best_practices,
  limitations, input_formats, output_formats, sources,
  search_provider, search_model, search_prompt_version,
  synthesis_provider, synthesis_model, synthesis_prompt_version,
  input_signature, researched_at, valid_until
)
select
  product_id, snapshot_version::integer, project_id, research_run_id, id,
  positioning, target_users, capabilities, key_features, pricing, official_best_practices,
  limitations, input_formats, output_formats, sources,
  search_provider, search_model, search_prompt_version,
  provider, model, prompt_version,
  input_signature, researched_at, researched_at + interval '90 days'
from historical
on conflict (origin_product_research_id) do nothing;

create function private.capture_completed_research_snapshots()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  source_row record;
  next_version integer;
begin
  if new.status <> 'completed' or old.status = 'completed' then return new; end if;
  for source_row in
    select pr.*
    from public.product_research pr
    where pr.research_run_id = new.id
      and pr.reused_from_snapshot = false
    order by pr.product_id
  loop
    if exists (
      select 1 from public.product_research_snapshots
      where origin_product_research_id = source_row.id
    ) then continue; end if;
    perform pg_advisory_xact_lock(hashtextextended(source_row.product_id::text, 0));
    select coalesce(max(version), 0) + 1 into next_version
    from public.product_research_snapshots where product_id = source_row.product_id;
    insert into public.product_research_snapshots (
      product_id, version, origin_project_id, origin_research_run_id, origin_product_research_id,
      positioning, target_users, capabilities, key_features, pricing, official_best_practices,
      limitations, input_formats, output_formats, sources,
      search_provider, search_model, search_prompt_version,
      synthesis_provider, synthesis_model, synthesis_prompt_version,
      input_signature, researched_at, valid_until
    ) values (
      source_row.product_id, next_version, source_row.project_id, source_row.research_run_id, source_row.id,
      source_row.positioning, source_row.target_users, source_row.capabilities, source_row.key_features,
      source_row.pricing, source_row.official_best_practices, source_row.limitations,
      source_row.input_formats, source_row.output_formats, source_row.sources,
      new.search_provider, new.search_model, new.search_prompt_version,
      new.provider, new.model, new.prompt_version,
      new.input_signature, coalesce(new.completed_at, now()),
      coalesce(new.completed_at, now()) + interval '90 days'
    );
  end loop;
  return new;
end;
$$;

create function private.reject_product_research_snapshot_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Product research snapshots are immutable';
end;
$$;

create trigger product_research_snapshots_are_immutable
before update or delete on public.product_research_snapshots
for each row execute function private.reject_product_research_snapshot_mutation();

create trigger research_runs_capture_product_snapshots
after update of status on public.research_runs
for each row execute function private.capture_completed_research_snapshots();

create function public.set_project_evaluation_mode(
  p_project_id uuid,
  p_evaluation_mode text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_evaluation_mode not in ('quick', 'professional') then
    raise exception 'Invalid project evaluation mode';
  end if;
  perform 1 from public.projects
  where id = p_project_id and deleted_at is null
  for update;
  if not found then raise exception 'Project not found'; end if;
  if exists (select 1 from public.protocols where project_id = p_project_id and status = 'locked') then
    raise exception 'Evaluation mode cannot change after Protocol Lock';
  end if;
  update public.projects
  set evaluation_mode = p_evaluation_mode,
      quick_preparation_status = 'running',
      quick_preparation_error = null,
      updated_at = now()
  where id = p_project_id;
end;
$$;

create function public.create_benchmark_project(
  p_name text,
  p_intent text,
  p_products jsonb,
  p_evaluation_mode text,
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

    insert into public.products (created_by, name, normalized_name, official_url)
    values (p_owner_id, product_name, normalized_product_name, product_url)
    on conflict (normalized_name) do update
      set official_url = coalesce(public.products.official_url, excluded.official_url),
          updated_at = now()
    returning id into selected_product_id;

    insert into public.project_products (
      project_id, product_id, display_order, submitted_name, submitted_official_url
    ) values (
      new_project_id, selected_product_id, product_position, product_name, product_url
    );
  end loop;

  return new_project_id;
end;
$$;

alter table public.test_artifacts
  drop constraint if exists test_artifacts_kind_check;
alter table public.test_artifacts
  add constraint test_artifacts_kind_check
  check (kind in ('image', 'pdf', 'text', 'video', 'document'));

update storage.buckets
set allowed_mime_types = array[
  'image/png', 'image/jpeg', 'image/webp', 'application/pdf',
  'text/plain', 'text/markdown', 'application/json', 'text/csv',
  'video/mp4', 'video/webm', 'video/quicktime',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint'
]::text[]
where id = 'benchmark-artifacts';

create or replace function public.record_test_artifact(
  p_test_run_id uuid,
  p_artifact jsonb,
  p_run_metadata jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_project_id uuid;
  target_protocol_id uuid;
  target_status text;
  artifact_id uuid;
  artifact_kind text;
  artifact_mime_type text;
  artifact_storage_path text;
begin
  select project_id, protocol_id, status
  into target_project_id, target_protocol_id, target_status
  from public.test_runs
  where id = p_test_run_id
  for update;
  if target_project_id is null or target_status not in ('pending', 'uploaded') then
    raise exception 'TestRun is unavailable for Artifact upload';
  end if;

  if not exists (
    select 1
    from public.protocols protocol
    join public.projects project on project.id = protocol.project_id
    where protocol.id = target_protocol_id
      and protocol.project_id = target_project_id
      and protocol.status = 'locked'
      and project.deleted_at is null
      and project.status = 'testing'
      and protocol.version = (
        select max(candidate.version)
        from public.protocols candidate
        where candidate.project_id = target_project_id
      )
  ) then
    raise exception 'Artifact upload requires the current locked Protocol in Test Execution';
  end if;

  if p_artifact is null or jsonb_typeof(p_artifact) <> 'object'
    or p_run_metadata is null or jsonb_typeof(p_run_metadata) <> 'object' then
    raise exception 'Artifact and TestRun metadata must be JSON objects';
  end if;

  artifact_id := (p_artifact->>'id')::uuid;
  artifact_kind := p_artifact->>'kind';
  artifact_mime_type := p_artifact->>'mimeType';
  artifact_storage_path := p_artifact->>'storagePath';

  if artifact_kind not in ('image', 'pdf', 'text', 'video', 'document')
    or artifact_mime_type not in (
      'image/png', 'image/jpeg', 'image/webp', 'application/pdf',
      'text/plain', 'text/markdown', 'application/json', 'text/csv',
      'video/mp4', 'video/webm', 'video/quicktime',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint'
    )
    or (p_artifact->>'sizeBytes')::bigint <= 0
    or (p_artifact->>'sizeBytes')::bigint > 52428800
    or char_length(btrim(coalesce(p_artifact->>'fileName', ''))) = 0
    or coalesce(p_artifact->>'sha256', '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Artifact metadata is invalid';
  end if;

  if (artifact_kind = 'image' and artifact_mime_type not like 'image/%')
    or (artifact_kind = 'pdf' and artifact_mime_type <> 'application/pdf')
    or (artifact_kind = 'text' and artifact_mime_type not in ('text/plain', 'text/markdown', 'application/json', 'text/csv'))
    or (artifact_kind = 'video' and artifact_mime_type not in ('video/mp4', 'video/webm', 'video/quicktime'))
    or (artifact_kind = 'document' and artifact_mime_type not in (
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint'
    )) then
    raise exception 'Artifact kind and MIME type do not match';
  end if;

  if artifact_storage_path not like format(
    'projects/%s/runs/%s/%s.%%', target_project_id, p_test_run_id, artifact_id
  ) then
    raise exception 'Artifact storage path does not match its TestRun lineage';
  end if;

  if jsonb_typeof(p_run_metadata->'retryCount') <> 'number'
    or (p_run_metadata->>'retryCount')::integer < 0
    or (p_run_metadata->>'retryCount')::integer > 20
    or jsonb_typeof(p_run_metadata->'manuallyEdited') <> 'boolean'
    or (p_run_metadata->'generationTimeSeconds' is not null
      and p_run_metadata->'generationTimeSeconds' <> 'null'::jsonb
      and jsonb_typeof(p_run_metadata->'generationTimeSeconds') <> 'number')
    or coalesce((p_run_metadata->>'generationTimeSeconds')::integer, 0) < 0
    or char_length(coalesce(p_run_metadata->>'notes', '')) > 2000 then
    raise exception 'TestRun execution metadata is invalid';
  end if;

  insert into public.test_artifacts (
    id, test_run_id, kind, bucket_id, storage_path, file_name, mime_type,
    size_bytes, sha256, metadata
  ) values (
    artifact_id, p_test_run_id, artifact_kind, 'benchmark-artifacts',
    artifact_storage_path, btrim(p_artifact->>'fileName'), artifact_mime_type,
    (p_artifact->>'sizeBytes')::bigint, p_artifact->>'sha256',
    coalesce(p_artifact->'metadata', '{}'::jsonb)
  );

  update public.test_runs
  set status = 'uploaded',
      generation_time_seconds = nullif(p_run_metadata->>'generationTimeSeconds', '')::integer,
      retry_count = (p_run_metadata->>'retryCount')::integer,
      manually_edited = (p_run_metadata->>'manuallyEdited')::boolean,
      notes = nullif(btrim(coalesce(p_run_metadata->>'notes', '')), '')
  where id = p_test_run_id;

  return artifact_id;
end;
$$;

comment on column public.projects.evaluation_mode is
  'quick is the default guided workflow; professional preserves the complete scoring and report workflow.';
comment on table public.product_research_snapshots is
  'Versioned reusable product facts. Project ResearchRuns reference snapshots through product_research.snapshot_id.';

revoke all on function public.set_project_evaluation_mode(uuid, text) from public, anon, authenticated;
revoke all on function public.create_benchmark_project(text, text, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.set_project_evaluation_mode(uuid, text) to service_role;
grant execute on function public.create_benchmark_project(text, text, jsonb, text, uuid) to service_role;
revoke all on function public.record_test_artifact(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.record_test_artifact(uuid, jsonb, jsonb) to service_role;
