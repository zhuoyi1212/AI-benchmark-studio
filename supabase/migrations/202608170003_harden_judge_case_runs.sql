create or replace function private.validate_judge_case_run_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  expected_score_count integer;
  actual_score_count integer;
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
  if old.status = 'pending' and new.status = 'running' and not exists (
    select 1 from public.judge_runs
    where id = new.judge_run_id and protocol_id = new.protocol_id and status = 'running'
  ) then
    raise exception 'JudgeCaseRun can only start inside a running JudgeRun';
  end if;
  if old.status = 'running' and new.status = 'completed' then
    select
      (select count(*) from public.blind_samples where protocol_id = new.protocol_id)
      * (select count(*) from public.rubric_dimensions where protocol_id = new.protocol_id)
      into expected_score_count;
    select count(*) into actual_score_count
      from public.judge_scores
      where judge_case_run_id = new.id and test_case_id = new.test_case_id;
    if expected_score_count = 0 or actual_score_count <> expected_score_count then
      raise exception 'Completed JudgeCaseRun requires the full Sample × Rubric score matrix for its TestCase';
    end if;
    new.completed_at := coalesce(new.completed_at, now());
  end if;
  return new;
end;
$$;
