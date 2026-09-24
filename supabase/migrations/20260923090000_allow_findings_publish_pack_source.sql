-- PublishPacks may originate from a completed Report or confirmed Findings.
create or replace function private.validate_publish_pack_source()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.report_id is not null then
    if not exists (
      select 1 from public.reports
      where id = new.report_id and project_id = new.project_id and status = 'completed'
    ) then
      raise exception 'Publish packs require a completed report';
    end if;
  elsif new.findings_id is not null then
    if not exists (
      select 1 from public.experience_findings
      where id = new.findings_id
        and project_id = new.project_id
        and status = 'completed'
        and human_confirmed_at is not null
    ) then
      raise exception 'Publish packs require confirmed Findings';
    end if;
  else
    raise exception 'Publish packs require a completed source';
  end if;

  if tg_op = 'UPDATE' and row(old.project_id, old.report_id, old.findings_id, old.version)
    is distinct from row(new.project_id, new.report_id, new.findings_id, new.version) then
    raise exception 'Publish pack source is immutable';
  end if;

  return new;
end;
$$;
