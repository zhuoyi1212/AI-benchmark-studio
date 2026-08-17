-- M9 Human Review lifecycle. AI scores remain immutable; every human change is
-- an append-only event and product identity is returned only after reveal.

create function public.ensure_review_session(
  p_project_id uuid,
  p_protocol_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  latest_judge_run_id uuid;
  latest_judge_status text;
  existing_session_id uuid;
  new_session_id uuid;
  project_status text;
begin
  select status into project_status
  from public.projects
  where id = p_project_id and deleted_at is null
  for update;
  if project_status is null then
    raise exception 'Human Review project not found';
  end if;

  select id, status into latest_judge_run_id, latest_judge_status
  from public.judge_runs
  where project_id = p_project_id and protocol_id = p_protocol_id
  order by attempt desc
  limit 1;
  if latest_judge_run_id is null or latest_judge_status <> 'completed' then
    raise exception 'Human Review requires the latest completed JudgeRun';
  end if;

  select id into existing_session_id
  from public.review_sessions
  where judge_run_id = latest_judge_run_id;
  if existing_session_id is not null then
    return existing_session_id;
  end if;
  if project_status <> 'reviewing' then
    raise exception 'A new Human Review session requires a reviewing project';
  end if;

  insert into public.review_sessions (
    project_id,
    protocol_id,
    judge_run_id,
    status
  ) values (
    p_project_id,
    p_protocol_id,
    latest_judge_run_id,
    'reviewing'
  ) returning id into new_session_id;
  return new_session_id;
end;
$$;

create function public.append_human_override(
  p_project_id uuid,
  p_review_session_id uuid,
  p_judge_score_id uuid,
  p_override_score numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_event_id uuid;
begin
  if not exists (
    select 1 from public.review_sessions
    where id = p_review_session_id
      and project_id = p_project_id
      and status = 'reviewing'
  ) then
    raise exception 'Human override requires an editable ReviewSession in this project';
  end if;
  if p_override_score is null
    or p_override_score < 0
    or p_override_score > 10
    or p_override_score * 10 <> trunc(p_override_score * 10)
    or char_length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Human override requires a 0-10 one-decimal score and reason';
  end if;
  insert into public.human_review_events (
    review_session_id,
    judge_score_id,
    action,
    override_score,
    reason
  ) values (
    p_review_session_id,
    p_judge_score_id,
    'override',
    p_override_score,
    left(btrim(p_reason), 2000)
  ) returning id into new_event_id;
  return new_event_id;
end;
$$;

create function public.append_human_revert(
  p_project_id uuid,
  p_review_session_id uuid,
  p_judge_score_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_override_id uuid;
  new_event_id uuid;
begin
  if not exists (
    select 1 from public.review_sessions
    where id = p_review_session_id
      and project_id = p_project_id
      and status = 'reviewing'
  ) then
    raise exception 'Human revert requires an editable ReviewSession in this project';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_review_session_id::text || ':' || p_judge_score_id::text, 0)
  );
  select id into active_override_id
  from public.human_review_events
  where review_session_id = p_review_session_id
    and judge_score_id = p_judge_score_id
  order by score_revision desc
  limit 1;
  if active_override_id is null or not exists (
    select 1 from public.human_review_events
    where id = active_override_id and action = 'override'
  ) then
    raise exception 'No active human override exists for this score';
  end if;

  insert into public.human_review_events (
    review_session_id,
    judge_score_id,
    action,
    target_event_id
  ) values (
    p_review_session_id,
    p_judge_score_id,
    'revert',
    active_override_id
  ) returning id into new_event_id;
  return new_event_id;
end;
$$;

create function public.lock_review_session(
  p_project_id uuid,
  p_review_session_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_session public.review_sessions%rowtype;
  expected_score_count integer;
  final_score_count integer;
begin
  perform 1 from public.projects
  where id = p_project_id and status = 'reviewing' and deleted_at is null
  for update;
  if not found then
    raise exception 'Final scores can only be locked from reviewing state';
  end if;

  select * into target_session
  from public.review_sessions
  where id = p_review_session_id
    and project_id = p_project_id
    and status = 'reviewing'
  for update;
  if target_session.id is null then
    raise exception 'ReviewSession is not editable';
  end if;

  select count(*) into expected_score_count
  from public.judge_scores
  where judge_run_id = target_session.judge_run_id;
  select count(*) into final_score_count
  from public.review_final_scores
  where review_session_id = target_session.id;
  if expected_score_count = 0 or final_score_count <> expected_score_count then
    raise exception 'Final Score matrix is incomplete';
  end if;

  update public.review_sessions
  set status = 'locked', updated_at = now()
  where id = target_session.id;
  update public.projects
  set status = 'review_locked', updated_at = now()
  where id = p_project_id;
end;
$$;

create function public.reveal_review_session(
  p_project_id uuid,
  p_review_session_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_session_id uuid;
begin
  perform 1 from public.projects
  where id = p_project_id and status = 'review_locked' and deleted_at is null
  for update;
  if not found then
    raise exception 'Reveal requires locked final scores';
  end if;

  select id into target_session_id
  from public.review_sessions
  where id = p_review_session_id
    and project_id = p_project_id
    and status = 'locked'
  for update;
  if target_session_id is null then
    raise exception 'Reveal requires a locked ReviewSession';
  end if;

  update public.review_sessions
  set status = 'revealed', updated_at = now()
  where id = target_session_id;
  update public.projects
  set status = 'completed', updated_at = now()
  where id = p_project_id;
end;
$$;

create function public.get_revealed_review_mapping(p_review_session_id uuid)
returns table (
  blind_sample_id uuid,
  sample_label text,
  product_id uuid,
  product_name text,
  product_logo_url text
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  target_project_id uuid;
  target_protocol_id uuid;
begin
  select project_id, protocol_id into target_project_id, target_protocol_id
  from public.review_sessions
  where id = p_review_session_id and status = 'revealed';
  if target_project_id is null then
    raise exception 'Product identity is unavailable before reveal';
  end if;

  return query
  select
    mapping.blind_sample_id,
    sample.label,
    mapping.product_id,
    product.name,
    product.logo_url
  from public.blind_mappings mapping
  join public.blind_samples sample on sample.id = mapping.blind_sample_id
  join public.products product on product.id = mapping.product_id
  where mapping.project_id = target_project_id
    and mapping.protocol_id = target_protocol_id
  order by sample.label;
end;
$$;

comment on function public.get_revealed_review_mapping(uuid) is
  'Returns Sample-to-Product identity only after the ReviewSession is revealed.';

revoke all on function public.ensure_review_session(uuid, uuid) from public, anon, authenticated;
revoke all on function public.append_human_override(uuid, uuid, uuid, numeric, text) from public, anon, authenticated;
revoke all on function public.append_human_revert(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.lock_review_session(uuid, uuid) from public, anon, authenticated;
revoke all on function public.reveal_review_session(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_revealed_review_mapping(uuid) from public, anon, authenticated;

grant execute on function public.ensure_review_session(uuid, uuid) to service_role;
grant execute on function public.append_human_override(uuid, uuid, uuid, numeric, text) to service_role;
grant execute on function public.append_human_revert(uuid, uuid, uuid) to service_role;
grant execute on function public.lock_review_session(uuid, uuid) to service_role;
grant execute on function public.reveal_review_session(uuid, uuid) to service_role;
grant execute on function public.get_revealed_review_mapping(uuid) to service_role;
