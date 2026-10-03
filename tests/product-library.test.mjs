import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { z } from 'zod';
import { findProductCandidates } from '../lib/product-selection.ts';
import { isVisibleProductLibraryEntry } from '../lib/product-library-visibility.ts';
import { isInternalValidationProject } from '../lib/project-visibility.ts';
const productId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const products=[{id:productId,name:'Product One',official_url:'https://one.invalid'}, {id:'hidden',name:'E2E fixture',official_url:null}];
const source=await readFile(new URL('../lib/services/product-library.service.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function service(overrides={}) {
  const calls=[];
  const repository={
    listProducts:async id=>{calls.push(id);return id?products.filter(p=>p.id===id):products;},
    listSnapshots:async()=>[],
    listTestedProducts:async()=>[{productId,projectId:'live'}],
    listProjectProducts:async()=>['live','archive','internal'].map(project_id=>({project_id,product_id:productId})),
    listProjects:async()=>[
      {id:'live',name:'Real test',deleted_at:null,evaluation_mode:'quick',created_at:'2026-10-03'},
      {id:'archive',name:'Archived',deleted_at:'2026-10-03'},
      {id:'internal',name:'[E2E] fixture',deleted_at:null},
    ],
    listOutputs:async ids=>{assert.deepEqual(ids,['live']);return {reports:[],articles:[]};},
    ...overrides,
  };
  const deps={ 'server-only':{}, zod:{z}, '@/lib/product-library-visibility':{isVisibleProductLibraryEntry}, '@/lib/project-visibility':{isInternalValidationProject}, '@/lib/repositories/product-library.repository':{productLibraryRepository:repository} };
  const module={exports:{}};
  new Function('require','module','exports',code)(name=>{assert.ok(name in deps,name);return deps[name];},module,module.exports);
  return {...module.exports,calls};
}
test('tested products are visible without research, with archived/internal projects excluded',async()=>{
  const api=service();
  assert.deepEqual(await api.listProductOptions(),[{id:productId,name:'Product One',officialUrl:'https://one.invalid'}]);
  const entries=await api.listProductLibrary();
  assert.equal(entries.length,1);
  assert.equal(entries[0].latestSnapshot,null);
  assert.deepEqual(entries[0].projects.map(p=>p.id),['live']);
});
test('empty products and research-only products are excluded from library, detail and suggestions',async()=>{
  const api=service({listTestedProducts:async()=>[],listSnapshots:async()=>{throw new Error('empty products must not load research');}});
  assert.deepEqual(await api.listProductOptions(),[]);
  // Empty snapshot reads are allowed by the repository, but cannot create a library entry.
  const noEvidence=service({listTestedProducts:async()=>[]});
  assert.deepEqual(await noEvidence.listProductLibrary(),[]);
  assert.equal(await noEvidence.getProductLibraryDetail(productId),null);
});
test('evidence must belong to this product and a visible project, not a comparison peer or internal run',async()=>{
  for (const runs of [[{productId,projectId:'archive'}],[{productId,projectId:'internal'}],[{productId:'other',projectId:'live'}]]) {
    assert.deepEqual(await service({listTestedProducts:async()=>runs}).listProductLibrary(),[]);
  }
});
test('deleted products remain recoverable even when their last project was archived',async()=>{
  const api=service({listProducts:async(id,archived)=>archived?[products[0]]:[],listTestedProducts:async()=>[]});
  assert.equal((await api.listProductLibrary(undefined,true))[0].id,productId);
  assert.deepEqual(await api.listProductLibrary(),[]);
});
test('archive and restore validate identity and delegate only product visibility',async()=>{
  const writes=[];
  const api=service({setArchived:async(...args)=>{writes.push(args);return true;}});
  assert.equal(await api.setProductArchived('invalid',true),false);
  assert.equal(await api.setProductArchived(productId,'true'),false);
  assert.equal(await api.setProductArchived(productId,true),true);
  assert.equal(await api.setProductArchived(productId,false),true);
  assert.deepEqual(writes,[[productId,true],[productId,false]]);
});
test('product detail validates ids and scopes outputs to visible linked projects',async()=>{
  const api=service();
  assert.equal(await api.getProductLibraryDetail('invalid'),null);
  assert.equal(api.calls.length,0);
  const detail=await api.getProductLibraryDetail(productId);
  assert.deepEqual(api.calls,[productId]);
  assert.equal(detail.product.id,productId);
});
test('candidate matching suggests by name or host without mutating or merging products',()=>{
  const choices=[{id:'a',name:'One',officialUrl:'https://www.vendor.invalid/a'}, {id:'b',name:'Two',officialUrl:'https://vendor.invalid/b'}];
  const before=structuredClone(choices);
  assert.deepEqual(findProductCandidates(choices,'','https://vendor.invalid').map(p=>p.id),['a','b']);
  assert.deepEqual(findProductCandidates(choices,'one','').map(p=>p.id),['a']);
  assert.deepEqual(findProductCandidates(choices,'',''),[]);
  assert.deepEqual(choices,before);
});
test('product outputs query metadata only, never blind mappings or AI input snapshots',async()=>{
  const repo=await readFile(new URL('../lib/repositories/product-library.repository.ts',import.meta.url),'utf8');
  assert.doesNotMatch(repo,/blind_mappings|input_snapshot|community_post|judge_scores/);
  assert.match(repo,/\.is\("deleted_at", null\)/);
});
