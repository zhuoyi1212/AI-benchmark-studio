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

  if artifact_kind not in ('image', 'pdf', 'text', 'video')
    or artifact_mime_type not in (
      'image/png', 'image/jpeg', 'image/webp', 'application/pdf',
      'text/plain', 'text/markdown', 'application/json', 'text/csv',
      'video/mp4', 'video/webm', 'video/quicktime'
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
    or (artifact_kind = 'video' and artifact_mime_type not in ('video/mp4', 'video/webm', 'video/quicktime')) then
    raise exception 'Artifact kind and MIME type do not match';
  end if;

  if artifact_storage_path not like format(
    'projects/%s/runs/%s/%s.%%',
    target_project_id,
    p_test_run_id,
    artifact_id
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

revoke all on function public.record_test_artifact(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.record_test_artifact(uuid, jsonb, jsonb) to service_role;
