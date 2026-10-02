begin;
set local role service_role;
do $test$
declare
  first_project uuid; second_project uuid; third_project uuid; product uuid;
  fixture_name text := 'E2E identity ' || gen_random_uuid();
  original_product jsonb; denied boolean;
begin
  first_project := public.create_benchmark_project('[E2E] product identity', 'Identity contract',
    jsonb_build_array(jsonb_build_object('name',fixture_name,'officialUrl','https://identity.example.invalid')), 'professional');
  select product_id into product from public.project_products where project_id=first_project;
  select to_jsonb(p) into original_product from public.products p where id=product;
  second_project := public.create_benchmark_project('[E2E] product identity', 'Another scenario',
    jsonb_build_array(jsonb_build_object('productId',product,'name','Alias label','officialUrl','https://untrusted.example.invalid')), 'professional');
  third_project := public.create_benchmark_project('[E2E] product identity', 'Third scenario',
    jsonb_build_array(jsonb_build_object('name',fixture_name,'officialUrl','https://identity.example.invalid/')), 'professional');
  assert (select count(*) from public.project_products where product_id=product and project_id in(first_project,second_project,third_project)) = 3, 'one identity across three projects';
  assert (select submitted_name=fixture_name and submitted_official_url='https://identity.example.invalid' from public.project_products where project_id=second_project), 'selected identity must use authoritative fields';
  assert original_product = (select to_jsonb(p) from public.products p where id=product), 'existing product mutated';
  denied := false;
  begin
    perform public.create_benchmark_project('[E2E] duplicate identity','duplicate',jsonb_build_array(
      jsonb_build_object('productId',product,'name','Alias one'),jsonb_build_object('productId',product,'name','Alias two')), 'professional');
  exception when sqlstate 'P1003' then denied:=true; end;
  assert denied, 'duplicate id admitted with different names';
  denied := false;
  begin
    perform public.create_benchmark_project('[E2E] conflicting identity','conflict',jsonb_build_array(jsonb_build_object('name',fixture_name,'officialUrl','https://another.example.invalid')), 'professional');
  exception when sqlstate 'P1001' then denied:=true; end;
  assert denied, 'same name and different website silently merged';
  denied := false;
  begin
    perform public.create_benchmark_project('[E2E] invalid identity','invalid',jsonb_build_array(jsonb_build_object('productId',gen_random_uuid(),'name','missing')), 'professional');
  exception when sqlstate 'P1002' then denied:=true; end;
  assert denied, 'missing id accepted';
  update public.products set archived_at=now() where id=product;
  denied := false;
  begin
    perform public.create_benchmark_project('[E2E] archived identity','archived',jsonb_build_array(jsonb_build_object('productId',product,'name',fixture_name)), 'professional');
  exception when sqlstate 'P1002' then denied:=true; end;
  assert denied, 'archived identity accepted';
  assert (select count(*) from public.projects where id in(first_project,second_project,third_project))=3;
  assert not exists(select 1 from public.projects where name in ('[E2E] duplicate identity','[E2E] conflicting identity','[E2E] invalid identity','[E2E] archived identity')), 'failed create left a project';
  assert not has_function_privilege('anon','public.create_benchmark_project(text,text,jsonb,text,uuid)','EXECUTE');
  assert not has_function_privilege('authenticated','public.create_benchmark_project(text,text,jsonb,text,uuid)','EXECUTE');
  assert has_function_privilege('service_role','public.create_benchmark_project(text,text,jsonb,text,uuid)','EXECUTE');
end
$test$;
rollback;
