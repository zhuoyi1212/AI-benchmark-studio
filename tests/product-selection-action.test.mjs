import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { z } from 'zod';
const source=await readFile(new URL('../app/projects/new/actions.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
class RepositoryError extends Error { constructor(code){super('fixture');this.code=code;} }
function action(errorCode) {
  const records=[];
  const dependencies={
    'next/cache':{revalidatePath:()=>{}},
    'next/navigation':{redirect:path=>{throw new Error(`redirect:${path}`);}},
    zod:{z},
    '@/lib/repositories/repository-error':{RepositoryError},
    '@/lib/services/projects.service':{createProject:async record=>{if(errorCode)throw new RepositoryError(errorCode);records.push(record);return 'project';}},
    '@/lib/services/quick-workflow.service':{}, '@/lib/quick/dispatch':{},
    '@/lib/project-mode':{isEvaluationMode:value=>['quick','professional'].includes(value)},
  };
  const module={exports:{}};
  new Function('require','module','exports',code)(name=>{assert.ok(name in dependencies,name);return dependencies[name];},module,module.exports);
  return {submit:form=>module.exports.createProjectAction({message:null},form),records};
}
function form(products){const result=new FormData();result.set('name','Repeated product');result.set('intent','New scenario');result.set('evaluationMode','professional');for(const product of products){result.append('productId',product.id??'');result.append('productName',product.name);result.append('productWebsite',product.url??'');}return result;}
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
test('selected product id survives the server action with real project navigation',async()=>{
  const api=action();
  await assert.rejects(api.submit(form([{id,name:'Product',url:'https://example.invalid'}])),/redirect:\/projects\/project\/research/);
  assert.equal(api.records[0].products[0].productId,id);
});
test('duplicate ids with different labels and malformed ids never reach creation',async()=>{
  for(const products of [[{id,name:'Alias one'},{id,name:'Alias two'}],[{id:'invalid',name:'Product'}]]){
    const api=action(); const result=await api.submit(form(products));assert.ok(result.message);assert.equal(api.records.length,0);
  }
});
test('website conflicts receive actionable feedback without exposing database errors',async()=>{
  const result=await action('P1001').submit(form([{name:'Product',url:'https://another.invalid'}]));
  assert.match(result.message,/官网不同/);assert.match(result.message,/选择已有产品/);
});
