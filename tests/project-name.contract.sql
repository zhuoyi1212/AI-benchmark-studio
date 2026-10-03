begin;
set local role service_role;
do $$
declare
  first_id uuid;
  second_id uuid;
  label text := '[E2E] Rename ' || gen_random_uuid();
  before_row jsonb;
  constraint_name text;
begin
  insert into public.projects(name,intent,status) values(label,'preserve intent','published') returning id into first_id;
  insert into public.projects(name,intent) values(label || ' other','another intent') returning id into second_id;
  select to_jsonb(p) - 'name' - 'updated_at' into before_row from public.projects p where id=first_id;
  update public.projects set name=label || ' revised' where id=first_id;
  assert (select (to_jsonb(p) - 'name' - 'updated_at')=before_row from public.projects p where id=first_id), 'rename must preserve other project fields';
  update public.projects set name=label where id=first_id;
  update public.projects set name=label where id=first_id;
  begin
    update public.projects set name=upper(label) || E'\t ' where id=second_id;
    raise exception 'duplicate update accepted';
  exception when unique_violation then
    get stacked diagnostics constraint_name = CONSTRAINT_NAME;
    assert constraint_name='projects_active_name_unique';
  end;
  begin
    insert into public.projects(name,intent) values(replace(lower(label),' ',E'  \t '),'duplicate creation');
    raise exception 'duplicate insert accepted';
  exception when unique_violation then null;
  end;
  assert (select name=label || ' other' from public.projects where id=second_id), 'failed rename must preserve old label';
  update public.projects set deleted_at=now() where id=first_id;
  update public.projects set name=label where id=second_id;
  begin
    update public.projects set deleted_at=null where id=first_id;
    raise exception 'restore conflict accepted';
  exception when unique_violation then null;
  end;
end $$;
rollback;
