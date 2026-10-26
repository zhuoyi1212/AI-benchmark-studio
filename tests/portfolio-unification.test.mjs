import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import createLoader from '../scripts/lib/load-typescript.cjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const load = createLoader(root);
const editions = JSON.parse(readFileSync(new URL('../docs/portfolio-unification/editions-20261023.json', import.meta.url)));
const { confirmedFindingsOutputSchema } = load('@/lib/ai/schemas/findings.schemas');
const { communityPostOutputSchema, publishConfigSchema, selectedContentIdeaSchema } = load('@/lib/ai/schemas/publish.schemas');
const { analysisExecutionExpired } = load('@/lib/analysis-lifecycle');
const { publishPresentation } = load('@/lib/publish-presentation');
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('seven editorial editions have valid facts, one article configuration and exact original-image anchors', () => {
  assert.equal(editions.length,7);
  assert.equal(new Set(editions.map(x => x.projectId)).size,7);
  for (const x of editions) {
    confirmedFindingsOutputSchema.parse(x.findings);
    communityPostOutputSchema.parse({...x.copy,screenshotRecommendations:x.recommendations});
    publishConfigSchema.parse(x.config); selectedContentIdeaSchema.parse(x.selectedIdea);
    assert.equal(x.config.structure,'自由结构');
    assert.equal(x.config.imageCount,x.recommendations.length);
    assert.equal(x.copy.tags.length,3);
    assert.equal(x.selectedIdea.title,x.copy.title);
    assert.ok(x.copy.title.length <= 28);
    for (const image of x.recommendations) {
      if (image.supportsClaim) assert.ok(x.copy.body.split(/\n\s*\n/)[image.supportsParagraph-1].includes(image.supportsClaim));
      else assert.equal(image.supportsParagraph,null);
    }
  }
  assert.deepEqual(editions.map(x=>x.recommendations.length),[2,0,0,1,0,0,2]);
});

test('new copy preserves uncertainty and fixes claims that exceeded the actual tests', () => {
  const jimeng=editions[0], kimi=editions[2], wan=editions[3], dongni=editions[4], comparison=editions[5], metaso=editions[6];
  assert.doesNotMatch(jimeng.selectedIdea.insight,/法定显式标识|交付拦路虎/);
  assert.match(kimi.findings.limitations.join(''),/专用深度研究模式及具体模型未确认/);
  assert.doesNotMatch(kimi.copy.title,/深度研究/); assert.match(kimi.copy.body,/专用模式没有确认/);
  assert.match(wan.copy.body,/103秒/); assert.match(wan.copy.body,/超过/);
  assert.match(dongni.copy.body,/模拟场景/); assert.match(dongni.copy.body,/没有真实谈薪结果/);
  assert.match(comparison.findings.limitations.join(''),/未独立复算CSV/);
  assert.match(metaso.copy.body,/不把PPT与文本的编号混为一套/);
});

test('public article projection removes internal notes, prompts and inherited review traces before serialization', () => {
  const edition=editions[0];
  const workspace={regenerationJob:{status:'failed',error_message:'private error'},screenshots:[{caption:'private test notes'}],pack:{config:{authorPerspective:{goal:'private'},tone:'private instruction',interactionGoal:'private'},ideas:[{title:'private old angle'}],selectedIdea:{title:'private old angle'},errorMessage:'private error',post:{...edition.copy,screenshotRecommendations:edition.recommendations,manualEdit:{aiReviewed:false},generationTrace:[{model:'source model'}],storyBrief:{spine:'private'}}}};
  const before=structuredClone(workspace);
  const publicView=publishPresentation(workspace,false);
  assert.doesNotMatch(JSON.stringify(publicView),/private|generationTrace|manualEdit|storyBrief/);
  assert.deepEqual(publicView.pack.post.body,edition.copy.body);
  assert.equal(publicView.screenshots[0].caption,null);
  assert.deepEqual(workspace,before);
  assert.equal(publishPresentation(workspace,true),workspace);
});

test('lost analysis workers become retryable without expiring completed or recent runs', () => {
  const now=Date.parse('2026-10-23T09:00:00Z');
  for (const status of ['pending','running']) assert.equal(analysisExecutionExpired({status,updated_at:'2026-10-14T09:00:00Z',started_at:null},now),true);
  for (const status of ['completed','failed']) assert.equal(analysisExecutionExpired({status,updated_at:'2026-10-14T09:00:00Z',started_at:null},now),false);
  assert.equal(analysisExecutionExpired({status:'running',updated_at:'2026-10-23T08:58:00Z',started_at:null},now),false);
  assert.equal(analysisExecutionExpired({status:'running',updated_at:'invalid',started_at:null},now),false);
});

test('effective Findings prefer a versioned editorial correction while raw AI and confirmation stay intact', async () => {
  const x=editions[0];const original={...x.findings,summary:'原始模型结论'};
  const originalRow={id:x.sourceFindingId,version:4,status:'completed',output:original,human_output:original,human_confirmed_at:'2026-10-14'};
  const t={project:{name:'Project',products:[{id:x.findings.findings[0].productId,name:'Product'}],evaluationMode:'quick'},protocol:{id:'protocol',version:1,testCases:[]},testRuns:[{status:'ready_for_review',artifacts:[{id:x.recommendations[0].artifactId,fileUrl:'https://fixture.invalid/image.png',fileType:'image/png'}]}]};
  const revisionLoad=createLoader(root,{
    '@/lib/supabase/read-scope':{memoPageRead:(_key,run)=>run()},
    '@/lib/services/test-execution.service':{getTestExecutionWorkspace:async()=>t},
    '@/lib/services/research.service':{getResearchWorkspace:async()=>({project:{intent:'Test'},completedResult:{}})},
    '@/lib/repositories/findings.repository':{findingsRepository:{list:async()=>[originalRow],listRevisions:async()=>[{id:'editorial',kind:'editorial',output:x.findings},{id:'recovered',kind:'recovered',output:original}]}},
  });
  const w=await revisionLoad('@/lib/services/findings.service').getExperienceFindingsWorkspace(x.projectId);
  assert.equal(w.latest.editorialRevisionId,'editorial');
  assert.equal(w.latest.effectiveOutput.summary,x.findings.summary);
  assert.equal(w.latest.aiOutput.summary,'原始模型结论');
  assert.equal(originalRow.human_output.summary,'原始模型结论');
});

test('revision migration keeps history immutable, guards stale sources and grants no public writes', () => {
  const sql=read('supabase/migrations/20261023071738_portfolio_editorial_history.sql');
  assert.match(sql,/before update or delete on public\.experience_finding_revisions/);
  assert.match(sql,/before update on public\.experience_findings/);
  assert.match(sql,/current_version<>p_expected_version/);
  assert.match(sql,/t\.product_id=\(item->>'productId'\)::uuid/);
  assert.match(sql,/revoke all on public\.experience_finding_revisions from public,anon,authenticated/);
  assert.match(sql,/security invoker set search_path/);
  assert.match(sql,/'manualEdit'.*'aiReviewed',false/);
  assert.doesNotMatch(sql,/update public\.judge_scores|delete from public\./);
  const history=read('app/projects/[projectId]/history/page.tsx');
  assert.ok(history.indexOf('!== "admin"') < history.indexOf('await findingsRepository.list(projectId)'));
});

test('future discovery and explicit regeneration retain their effective Findings revision source', () => {
  const binding=read('supabase/migrations/20261023073415_bind_findings_editorial_sources.sql');
  assert.match(binding,/human_confirmed_at is not null for update/);
  assert.match(binding,/findings_id, findings_revision_id, version/);
  assert.match(binding,/case when p_mode='regenerate' then \(select id from public\.experience_finding_revisions/);
  assert.match(binding,/kind='editorial' order by version desc limit 1/);
});
