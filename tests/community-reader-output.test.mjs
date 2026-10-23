import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { formatCommunityPostForCopy } from '../lib/community-post-formatter.ts';
import { harness, config, draft, rawEvidence, quick } from './helpers/publication.mjs';

for (const professional of [false, true]) test(`${professional ? 'professional' : 'quick'} writer follows the validated brief without duplicate finding or old idea metadata`, async () => {
  const h = harness({ professional });
  await h.run();
  const planner = JSON.parse(h.state.calls[0].messages[1].content);
  const writer = JSON.parse(h.state.calls[1].messages[1].content);
  assert.deepEqual(writer.factLedger, planner.factLedger);
  assert.deepEqual(writer.scopeNotes, planner.scopeNotes);
  assert.deepEqual(writer.tasks, planner.tasks);
  assert.deepEqual(writer.products, planner.products);
  assert.deepEqual(writer.config, planner.config);
  assert.equal(writer.originalDetails, rawEvidence);
  assert.deepEqual(writer.storyBrief, h.state.saved.storyBrief);
  for (const field of ['selectedIdea', 'humanConfirmedFindings', 'imageArtifacts', 'template']) assert.equal(Object.hasOwn(writer, field), false, field);
  assert.equal(h.state.calls.length, 4);
  assert.equal(h.state.saved.contentPolicyVersion, 'community-story.v11-context-baseline');
  assert.deepEqual(h.state.saved.styleEdit.original, h.state.saved.styleEdit.edited);
});

test('focused writing keeps real author input, all task conditions and different limitations', async () => {
  const workspace = structuredClone(quick);
  workspace.testCases[0].inputDescription = '输入是待回复的原文，不是作者的真实职场经历。';
  workspace.latest.effectiveOutput.limitations.push('没有测试不同性格画像。');
  const authorPerspective = { goal: '准备沟通', focus: '清单是否具体', tradeoff: '', verdict: '' };
  const h = harness({ workspace });
  await h.run({ ...config, authorPerspective });
  const writer = JSON.parse(h.state.calls[1].messages[1].content);
  assert.deepEqual(writer.authorPerspective, authorPerspective);
  assert.equal(writer.scopeNotes.length, 2);
  assert.equal(writer.tasks[0].inputDescription, workspace.testCases[0].inputDescription);
  assert.equal(writer.originalDetails, rawEvidence);
});

test('repetition is resolved by the one targeted revision and the final audit receives that exact copy', async () => {
  const h = harness({ mutate: (stage, value) => {
    if (stage === 'CommunityPostDraft') return { ...value, body: `${draft.body}\n\n${draft.body}` };
    if (stage === 'CommunityPostRevision') return { title: draft.title, body: draft.body, interactionQuestion: '' };
    return value;
  } });
  await h.run();
  assert.equal(h.state.calls.length, 5);
  assert.deepEqual(h.state.calls.map(c => c.schemaName), ['CommunityStoryBrief', 'CommunityPostDraft', 'CommunityPostReview', 'CommunityPostRevision', 'EvidenceCheckedCommunityPost']);
  assert.equal(h.state.saved.body, draft.body);
  assert.equal(JSON.parse(h.state.calls.at(-1).messages[1].content).draft.body, draft.body);
  const revision = JSON.parse(h.state.calls[3].messages[1].content);
  assert.ok(revision.review.deterministicIssues.some(i => i.includes('重复')));
  assert.equal(Object.hasOwn(revision, 'selectedIdea'), false);
});

test('clipboard omits empty interaction and repeats neither a standalone question nor blank sections', () => {
  const copy = { title: '标题', body: '原始正文。', interactionQuestion: '', tags: '标签' };
  assert.equal(formatCommunityPostForCopy(copy), '标题\n\n原始正文。\n\n标签');
  const question = '你会核对来源吗？';
  const repeated = { ...copy, body: `原始正文。\n\n${question}`, interactionQuestion: question };
  assert.equal(formatCommunityPostForCopy(repeated), `标题\n\n原始正文。\n\n${question}\n\n标签`);
  assert.equal(repeated.interactionQuestion, question);
  assert.ok(formatCommunityPostForCopy({ ...repeated, interactionQuestion: '你会核对来源吗?' }).endsWith(`${question}\n\n标签`));
  const different = formatCommunityPostForCopy({ ...repeated, interactionQuestion: '你会检查哪些来源？' });
  assert.ok(different.includes(`${question}\n\n你会检查哪些来源？`));
});

test('archived exact duplicate is copied once without modifying article history', async () => {
  const data = JSON.parse(await readFile(new URL('../docs/project-articles/项目与文章汇编数据.json', import.meta.url), 'utf8'));
  const article = data.projects.flatMap(p => p.articles).find(a => a.id === '8b4ef80f-33c9-47bc-a065-a04614355ae4');
  const original = structuredClone(article);
  const copy = formatCommunityPostForCopy({ ...article, tags: article.tags.join(' ') });
  assert.equal(copy.split(article.interactionQuestion).length - 1, 1);
  assert.ok(copy.includes(article.body));
  assert.deepEqual(article, original);
});
