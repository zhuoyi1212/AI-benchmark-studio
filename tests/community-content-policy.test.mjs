import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseWritingTemplate, publicationCopyIssues, writingPlanIssues, publicationStyleIssues, scopeNotesIssues, unsupportedPublicationClaims } from '../lib/community-content-policy.ts';
import { publicationAuditSchema, communityContentReviewSchema, communityPostOutputSchema } from '../lib/ai/schemas/publish.schemas.ts';
import { config, findings, draft, id, harness, review, preservation } from './helpers/publication.mjs';
const fact = { ...findings[0], interpretation: findings[0].impact };

test('all legacy structure preferences reject classification shells, empty sections and repeated copy', () => {
  for (const prefix of ['好用的：', '好用的:', '一般：', '难用的：', '## **好用的功能**', '不舒服的地方：没有。', '缺点：无']) {
    assert.ok(publicationCopyIssues({ ...draft, body: prefix + '\n\n' + draft.body }).length, prefix);
  }
  assert.deepEqual(publicationCopyIssues(draft), []);
  assert.deepEqual(publicationCopyIssues({ ...draft, body: '这次回答一般，但列出了具体材料要求。' }), []);
  assert.ok(publicationCopyIssues({ ...draft, body: draft.body + '\n\n' + draft.body }).length);
  assert.ok(publicationCopyIssues({ ...draft, interactionQuestion: draft.body }).length);
});

test('automatic structure selection follows tested coverage instead of product count alone', () => {
  assert.equal(chooseWritingTemplate([fact], [id], config), 'single_scene');
  const another = { ...fact, id: 'second', testCaseId: 'other', productId: 'other' };
  assert.equal(chooseWritingTemplate([fact, another], [], config), 'multi_feature');
  assert.equal(chooseWritingTemplate([fact, { ...another, testCaseId: id }], [], config), 'comparison');
  assert.equal(chooseWritingTemplate([fact, another], [id], config), 'single_scene');
});

test('plans reject invented sources and quotes, duplicate material and unsupported comparison', () => {
  const plan = draft.writingPlan;
  assert.deepEqual(writingPlanIssues(plan, [fact], 'single_scene'), []);
  for (const section of [{ ...plan.sections[0], sourceIds: ['fake'] }, { ...plan.sections[0], observationQuote: '这段话不是实际观察' }, { ...plan.sections[0], heading: '一般：' }]) {
    assert.ok(writingPlanIssues({ ...plan, sections: [section] }, [fact], 'single_scene').length);
  }
  assert.ok(writingPlanIssues({ ...plan, sections: [plan.sections[0], plan.sections[0]] }, [fact], 'single_scene').length);
  assert.ok(writingPlanIssues({ ...plan, template: 'comparison' }, [fact], 'single_scene').length);
});

test('polish retains numeric tokens and concrete evidence while permitting natural prose', () => {
  assert.deepEqual(publicationStyleIssues(draft, draft, draft.writingPlan), []);
  assert.ok(publicationStyleIssues(draft, { ...draft, body: draft.body.replace('15分钟', '30分钟') }, draft.writingPlan).length);
  assert.ok(publicationStyleIssues(draft, { ...draft, body: draft.body.replace(findings[0].observation, '') }, draft.writingPlan).length);
});

for (const professional of [false, true]) test(`${professional ? 'professional' : 'quick'} Story Brief pipeline saves only the independently audited copy`, async () => {
  const h = harness({ professional });
  await h.run();
  assert.deepEqual(h.state.calls.map(c => c.schemaName), ['CommunityStoryBrief', 'CommunityPostDraft', 'CommunityPostReview', 'EvidenceCheckedCommunityPost']);
  assert.equal(h.state.rawReads, 1);
  assert.equal(h.state.saved.contentPolicyVersion, 'community-story.v2');
  assert.equal(h.state.saved.body, h.state.saved.styleEdit.edited.body);
  assert.equal(h.state.saved.body, draft.body);
  assert.equal(h.state.saved.styleEdit.changed, false);
  assert.equal(h.state.usage.inputTokens, 40);
  assert.equal(h.state.saved.generationTrace.length, 4);
  assert.ok(h.state.saved.body.length < 200, 'short observations do not need padding');
  const source = JSON.parse(h.state.calls[0].messages[1].content);
  for (const field of ['ranking', 'caseScores', 'report', 'finalScore']) assert.equal(JSON.stringify(source).includes(`"${field}":`), false, field);
  assert.equal(h.state.calls[2].messages.at(-1).content, h.state.calls[3].messages.at(-1).content);
});

test('reported issues trigger one revision and an independent audit of the actual revised copy', async () => {
  const h = harness({ mutate: (stage, value) => stage === 'CommunityPostReview' ? { ...value, articleReview: { ...review, usefulConclusion: false, issues: ['缺少使用建议'] }, issues: [{ field: 'body', quote: null, kind: 'structure', reason: '缺少使用建议', instruction: '增加有依据的使用建议' }] } : value });
  await h.run();
  assert.deepEqual(h.state.calls.map(c => c.schemaName), ['CommunityStoryBrief', 'CommunityPostDraft', 'CommunityPostReview', 'CommunityPostRevision', 'EvidenceCheckedCommunityPost']);
  assert.equal(h.state.saved.styleEdit.changed, true);
  assert.equal(h.state.saved.generationTrace.length, 5);
  const audit = JSON.parse(h.state.calls.at(-1).messages[1].content);
  assert.equal(audit.draft.body, h.state.saved.body);
  assert.equal(h.state.usage.inputTokens, 50);
});

for (const key of ['facts', 'scope', 'stance', 'experience', 'advice', 'evidence']) test(`final ${key} drift blocks publication without self-approving retries`, async () => {
  const h = harness({ mutate: (stage, value) => stage === 'EvidenceCheckedCommunityPost' ? { ...value, stylePreservation: { ...preservation, [key]: false } } : value });
  await assert.rejects(h.run(), /保真/);
  assert.equal(h.state.saved, null);
  assert.equal(h.state.calls.length, 4);
});

test('revision cannot edit protected metadata and final auditor cannot replace article', async () => {
  const h = harness({ mutate: (stage, value) => stage === 'CommunityPostReview' ? { ...value, issues: [{ field: 'body', quote: null, kind: 'language', reason: '重复', instruction: '删重复' }] } : stage === 'CommunityPostRevision' ? { ...value, tags: ['越权'] } : value });
  await assert.rejects(h.run(), /修订/);
  assert.equal(h.state.saved, null);
  assert.equal(publicationAuditSchema.safeParse({ articleReview: review, stylePreservation: preservation, screenshotRecommendations: [], body: '替换文章' }).success, false);
});

test('content review cannot rewrite the evidence plan or other protected metadata', () => {
  const reviewOutput = { title: draft.title, body: draft.body, interactionQuestion: draft.interactionQuestion, articleReview: review, factCheck: { status: 'passed', revisedClaimCount: 0, notes: [] } };
  assert.equal(communityContentReviewSchema.safeParse(reviewOutput).success, true);
  assert.equal(communityContentReviewSchema.safeParse({ ...reviewOutput, writingPlan: draft.writingPlan }).success, false);
  assert.equal(communityContentReviewSchema.safeParse({ ...reviewOutput, tags: draft.tags }).success, false);
});

test('invalid optional screenshot mappings are dropped without blocking an audited article', async () => {
  const h = harness({ mutate: (stage, value) => stage === 'EvidenceCheckedCommunityPost' ? { ...value, screenshotRecommendations: [{ artifactId: id, reason: '测试', supportsClaim: '不在正文', supportsParagraph: 99, order: 1 }] } : value });
  await h.run();
  assert.deepEqual(h.state.saved.screenshotRecommendations, []);
});

test('missing semantic review and old unstructured articles have separate contracts', () => {
  assert.equal(publicationAuditSchema.safeParse({ articleReview: review, screenshotRecommendations: [] }).success, false);
  assert.equal(communityPostOutputSchema.safeParse({ title: '历史', body: '好用的：历史内容保持可读。', tags: ['历史'], interactionQuestion: '', screenshotRecommendations: [] }).success, true);
});


test('scope notes cannot invent missing logs or new test limitations', () => {
  assert.deepEqual(scopeNotesIssues(draft.writingPlan, draft.writingPlan.scopeNotes), []);
  assert.ok(scopeNotesIssues({ ...draft.writingPlan, scopeNotes: ['没有留存过程'] }, draft.writingPlan.scopeNotes).length);
});


test('real model regressions: invented savings and missing logs cannot pass as observations', () => {
  for (const body of ['空间关系不需要额外补镜头。', '这一层可以整段使用。', '没有留存过程记录。', '近景和远景单看都没问题。', '生成和校验两步没接上。', '生成逻辑与校验规则的脱节。']) {
    assert.ok(unsupportedPublicationClaims({ ...draft, body }, [fact], draft.writingPlan.scopeNotes).length, body);
  }
  assert.deepEqual(unsupportedPublicationClaims({ ...draft, body: '一次观察不能证明稳定性。' }, [fact], []), []);
});

test('unmodified revision cannot claim to resolve the review', async () => {
  const h = harness({ mutate: (stage, value, input) => stage === 'CommunityPostReview' ? { ...value, issues: [{ field: 'body', quote: null, kind: 'structure', reason: '缺少结论', instruction: '补结论' }] } : stage === 'CommunityPostRevision' ? input.draft : value });
  await assert.rejects(h.run(), /未被实际修订/);
  assert.equal(h.state.saved, null);
  assert.equal(h.state.calls.length, 4);
});

test('all-negative evidence does not require a fabricated positive section', async () => {
  const { quick } = await import('./helpers/publication.mjs');
  const workspace = structuredClone(quick);
  workspace.latest.effectiveOutput.findings[0].category = 'problem';
  const h = harness({ workspace });
  await h.run();
  assert.ok(h.state.saved);
  assert.equal(h.state.saved.editorialPlan, undefined);
});

test('real image mappings can persist without filling the requested image quota', async () => {
  const { quick } = await import('./helpers/publication.mjs');
  const workspace = structuredClone(quick);
  workspace.artifacts[0].mimeType = 'image/png';
  workspace.artifacts[0].fileName = 'fixture.png';
  const h = harness({ workspace, mutate: (stage, value) => stage === 'EvidenceCheckedCommunityPost' ? {
    ...value, screenshotRecommendations: [{ artifactId: id, reason: '原始回答截图', supportsClaim: findings[0].observation, supportsParagraph: 1, order: 1 }],
  } : value });
  await h.run({ ...config, imageCount: 3 });
  assert.equal(h.state.saved.screenshotRecommendations.length, 1);
  assert.equal(h.state.config.imageCount, 1);
});
