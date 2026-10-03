import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { z } from 'zod';
import { projectNameSchema } from '../lib/project-name.ts';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
class RepositoryError extends Error { constructor(code){super('private database detail');this.code=code;} }
async function load(path,deps){
  const source=await readFile(new URL(path,import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};
  new Function('require','module','exports',code)(name=>{assert.ok(name in deps,name);return deps[name];},module,module.exports);
  return module.exports;
}
async function action(renameProject){
  const refresh=[];
  const api=await load('../app/projects/actions.ts',{
    'next/cache':{revalidatePath:(...args)=>refresh.push(args)},zod:{z},
    '@/lib/project-name':{projectNameSchema},
    '@/lib/repositories/repository-error':{RepositoryError},
    '@/lib/services/projects.service':{renameProject},
  });
  return {...api,refresh};
}
test('rename validates names and ids before writes, normalizes surrounding and repeated whitespace',async()=>{
  const writes=[];const api=await action(async(...args)=>{writes.push(args);return true;});
  for(const name of ['', ' \n\t ', 'x'.repeat(121), null]) assert.equal((await api.renameProjectAction(id,name)).ok,false);
  assert.equal((await api.renameProjectAction('invalid','Good')).ok,false);
  assert.equal(writes.length,0);
  assert.deepEqual(await api.renameProjectAction(id,'  New \n  Test  '),{ok:true});
  assert.deepEqual(writes,[[id,'New Test']]);
  assert.deepEqual(api.refresh,[['/','layout']]);
});
test('duplicate names and missing or archived records show actionable errors without success refresh',async()=>{
  for(const [mutate,pattern] of [[async()=>{throw new RepositoryError('23505');},/同名/],[async()=>false,/已被删除/],[async()=>{throw new RepositoryError('other');},/稍后重试/]]){
    const api=await action(mutate);const result=await api.renameProjectAction(id,'Name');
    assert.equal(result.ok,false);assert.match(result.message,pattern);assert.doesNotMatch(result.message,/private/);assert.deepEqual(api.refresh,[]);
  }
});
test('repository changes only active project name and relies on database uniqueness',async()=>{
  const ops=[]; const query={};
  for(const method of ['update','eq','is','select']) query[method]=(...args)=>{ops.push([method,...args]);return query;};
  query.maybeSingle=async()=>({data:{id},error:null});
  const {projectsRepository}=await load('../lib/repositories/projects.repository.ts',{
    'server-only':{},'@/lib/repositories/repository-error':{throwRepositoryError:()=>{throw Error('db');}},
    '@/lib/supabase/server':{getSupabaseServerClient:()=>({from:table=>{ops.push(['from',table]);return query;}})},
  });
  assert.equal(await projectsRepository.rename(id,'New'),true);
  assert.deepEqual(ops,[['from','projects'],['update',{name:'New'}],['eq','id',id],['is','deleted_at',null],['select','id']]);
});
