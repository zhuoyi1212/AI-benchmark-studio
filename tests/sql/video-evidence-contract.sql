-- Run inside a transaction; never changes existing experiments.
begin;
set local role service_role;
do $$
declare
  source record;
  run_id uuid;
  case_id uuid;
  identity_name text;
  official_url text;
  content text;
  output text;
begin
  if pg_catalog.has_function_privilege('anon', 'public.redact_video_judge_evidence(uuid,uuid,text)', 'execute')
    or pg_catalog.has_function_privilege('authenticated', 'public.redact_video_judge_evidence(uuid,uuid,text)', 'execute') then
    raise exception 'Untrusted role can call video redaction';
  end if;
  select run.project_id, run.protocol_id into source from public.judge_runs run
  join public.projects project on project.id=run.project_id
  join public.protocols protocol on protocol.id=run.protocol_id
  where project.deleted_at is null and protocol.status='locked'
    and not exists (select 1 from public.test_runs tr where tr.protocol_id=run.protocol_id and tr.status<>'ready_for_review')
    and exists (select 1 from public.test_runs tr where tr.protocol_id=run.protocol_id) order by run.created_at desc limit 1;
  if source is null then raise exception 'No existing locked fixture context'; end if;
  select id into case_id from public.test_cases where protocol_id=source.protocol_id limit 1;
  select product.name, product.official_url into identity_name, official_url
  from public.products product join public.project_products link on link.product_id=product.id
  where link.project_id=source.project_id limit 1;
  insert into public.judge_runs(project_id,protocol_id,attempt,status,model,prompt_version,input_snapshot,input_signature)
  values(source.project_id,source.protocol_id,(select coalesce(max(attempt),0)+1 from public.judge_runs where protocol_id=source.protocol_id),
    'pending','fixture','fixture','{}','fixture') returning id into run_id;
  insert into public.judge_run_artifacts(judge_run_id,artifact_id)
  select run_id,artifact.id from public.test_runs test_run
  join public.test_artifacts artifact on artifact.test_run_id=test_run.id
  where test_run.protocol_id=source.protocol_id;
  update public.judge_runs set status='running' where id=run_id;
  content := 'artifactId: 11111111-1111-4111-8111-111111111111; visibleText: ' || identity_name || ' ' || upper(identity_name) || ' ' || coalesce(official_url,'');
  output := public.redact_video_judge_evidence(run_id,case_id,content);
  if strpos(lower(output),lower(identity_name))>0 or (official_url is not null and strpos(lower(output),lower(official_url))>0) then raise exception 'Identity was not redacted'; end if;
  if strpos(output,'11111111-1111-4111-8111-111111111111')=0 then raise exception 'Artifact reference was corrupted'; end if;
  begin
    perform public.redact_video_judge_evidence(run_id,'00000000-0000-4000-8000-000000000000',content);
    raise exception 'Unknown case accepted';
  exception when raise_exception then
    if sqlerrm='Unknown case accepted' then raise; end if;
  end;
  begin
    perform public.redact_video_judge_evidence(run_id,case_id,repeat('x',2000001));
    raise exception 'Oversized content accepted';
  exception when raise_exception then
    if sqlerrm='Oversized content accepted' then raise; end if;
  end;
  raise notice 'Video evidence redaction, source integrity, access control and limits passed';
end;
$$;
rollback;
