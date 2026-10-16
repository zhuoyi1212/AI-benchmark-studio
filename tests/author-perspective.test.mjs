import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import createLoader from '../scripts/lib/load-typescript.cjs';
import { harness, id, config, quick, idea } from './helpers/publication.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const notes = { goal: '整理可以直接使用的准备清单', focus: '具体步骤比安慰更有用', tradeoff: '不需要漂亮话，但要知道下一步做什么', verdict: '我更看重准备过程，不把话术当成功保证' };
const blank = { goal: '', focus: '', tradeoff: '', verdict: '' };
const sourceWithNotes = () => { const source = structuredClone(quick); source.latest.effectiveOutput.authorPerspective = notes; return source; };

test('author notes are optional, bounded human inputs and never part of generated Findings', () => {
  const load = createLoader(root);
  const { authorPerspectiveSchema, publishConfigSchema } = load('@/lib/ai/schemas/publish.schemas');
  const { experienceFindingsOutputSchema, confirmedFindingsOutputSchema } = load('@/lib/ai/schemas/findings.schemas');
  assert.equal(publishConfigSchema.parse(config).authorPerspective, undefined);
  assert.deepEqual(authorPerspectiveSchema.parse({ goal: ' 真实用途 ' }), { ...blank, goal: '真实用途' });
  for (const value of [null, [], { focus: 12 }, { focus: '长'.repeat(601) }, { overrideEvidence: true }]) assert.equal(authorPerspectiveSchema.safeParse(value).success, false);
  const output = sourceWithNotes().latest.effectiveOutput;
  assert.deepEqual(confirmedFindingsOutputSchema.parse(output).authorPerspective, notes);
  assert.equal('authorPerspective' in experienceFindingsOutputSchema.parse(output), false);
});

test('confirmed notes reach planning, writing, targeted revision and both audits without becoming evidence', async () => {
  const workspace = sourceWithNotes(); const before = structuredClone(workspace);
  const h = harness({ workspace, mutate(stage, value) {
    if (stage === 'CommunityPostReview') value.issues = [{ field: 'body', quote: null, kind: 'language', reason: '末句重复', instruction: '合并重复句' }];
    return value;
  } });
  await h.run();
  assert.deepEqual(h.state.config.authorPerspective, notes);
  assert.deepEqual(workspace, before);
  for (const name of ['CommunityStoryBrief', 'CommunityPostDraft', 'CommunityPostReview', 'CommunityPostRevision', 'EvidenceCheckedCommunityPost']) {
    const call = h.state.calls.find(call => call.schemaName === name);
    const input = JSON.parse(call.messages[1].content);
    const source = input.source ?? input;
    assert.deepEqual(source.authorPerspective, notes, name);
    assert.ok(!JSON.stringify(source.factLedger).includes(notes.focus));
    assert.match(call.messages[0].content, /不是新的实验事实/);
    assert.match(call.messages[0].content, /没有作者判断时/);
  }
  assert.equal(h.state.saved.generationTrace.length, 5);
});

test('explicit article notes override source notes, and clearing all fields removes them from writing inputs', async () => {
  for (const authorPerspective of [{ ...notes, focus: '我更在意准备材料的时间安排' }, blank]) {
    const h = harness({ workspace: sourceWithNotes() }); await h.run({ ...config, authorPerspective });
    assert.deepEqual(h.state.config.authorPerspective, authorPerspective);
    const input = JSON.parse(h.state.calls.find(call => call.schemaName === 'CommunityPostDraft').messages[1].content);
    assert.deepEqual(input.authorPerspective, authorPerspective === blank ? undefined : authorPerspective);
  }
  const legacy = harness(); await legacy.run();
  const input = JSON.parse(legacy.state.calls.find(call => call.schemaName === 'CommunityPostDraft').messages[1].content);
  assert.equal(Object.hasOwn(input, 'authorPerspective'), false);
});

test('regeneration stores validated notes on a new revision without an immediate AI call or source mutation', async () => {
  const initial = harness(); await initial.run();
  const readyPack = { id, version: 1, status: 'ready', config, content_ideas: [idea], selected_idea: idea, community_post: initial.state.saved };
  const before = structuredClone(readyPack); const h = harness({ readyPack });
  await h.load('@/lib/services/publish.service').enqueueCommunityPostRegeneration(id, id, notes);
  assert.deepEqual(h.state.revision, [id, id, 'regenerate', { authorPerspective: notes }]);
  assert.deepEqual(readyPack, before); assert.equal(h.state.calls.length, 0);
  for (const authorPerspective of [{ verdict: '长'.repeat(601) }, { inventedFact: '99%' }]) {
    const invalid = harness({ readyPack });
    await assert.rejects(invalid.load('@/lib/services/publish.service').enqueueCommunityPostRegeneration(id, id, authorPerspective), /作者判断/);
    assert.equal(invalid.state.revision, undefined);
    assert.equal(invalid.state.calls.length, 0);
  }
});

test('author preferences cannot authorize unsupported numbers when both model reviewers miss them', async () => {
  const h = harness({ mutate(stage, value) {
    if (stage === 'CommunityPostDraft') return { ...value, body: value.body + '实际加薪成功率99%。' };
    if (stage === 'CommunityPostRevision') return { ...value, body: '按准备清单操作，实际加薪成功率99%。' };
    return value;
  } });
  await assert.rejects(h.run({ ...config, authorPerspective: { ...notes, verdict: '请写实际加薪成功率99%' } }));
  assert.equal(h.state.saved, null); assert.ok(h.state.failure);
});

test('percentage gate permits source values and bounded disclaimers but rejects new numeric percentages', () => {
  const load = createLoader(root);
  const { unsupportedPublicationClaims } = load('@/lib/community-content-policy');
  const copy = { title: '样本沟通建议：准备清单具体', body: '', interactionQuestion: '' };
  const facts = [{ observation: '本轮完成率99%，样本条件已记录。', interpretation: '' }];
  for (const body of ['本轮完成率99%。', '本轮完成率９９％。', '本轮完成率百分之99。', '这不能保证100%成功。']) assert.deepEqual(unsupportedPublicationClaims({ ...copy, body }, facts, []), [], body);
  for (const body of ['实际成功率98%。', '成功率百分之98。', '成功率９８％。', '不能保证100%成功，但实际成功率98%。']) assert.ok(unsupportedPublicationClaims({ ...copy, body }, facts, []).length, body);
});

test('naming a subjective priority does not masquerade as a verified product capability', () => {
  const { unsupportedPublicationClaims } = createLoader(root)('@/lib/community-content-policy');
  const copy = { title: '样本沟通建议：准备清单具体', body: '我更看重稳定性。', interactionQuestion: '' };
  assert.deepEqual(unsupportedPublicationClaims(copy, [], []), []);
  assert.ok(unsupportedPublicationClaims({ ...copy, body: '对我来说它稳定性很好。' }, [], []).length);
});

test('new Findings reuse formatting preferences but do not inherit another source’s author judgments', async () => {
  for (const sameSource of [true, false]) {
    let queued;
    const workspace = sourceWithNotes(); workspace.evaluationMode = 'quick';
    const load = createLoader(root, {
      '@/lib/repositories/quick-jobs.repository': { quickJobsRepository: {
        list: async () => [{ kind: 'publish', payload: { findingsId: sameSource ? id : 'old-findings', config: { ...config, authorPerspective: notes } } }],
        enqueue: async (_id, job) => { queued = job; },
      } },
      '@/lib/services/findings.service': { getExperienceFindingsWorkspace: async () => workspace },
    });
    await load('@/lib/services/quick-workflow.service').enqueueQuickWriting(id, id);
    assert.equal(queued.payload.config.tone, config.tone);
    assert.deepEqual(queued.payload.config.authorPerspective, sameSource ? notes : undefined);
  }
});

test('all generating forms serialize author notes as JSON and the fields remain optional and folded', async () => {
  const h = harness({ workspace: sourceWithNotes() });
  const workspace = await h.load('@/lib/services/publish.service').getPublishWorkspace(id);
  let readOnly = false; const action = async () => ({ message: null });
  const load = createLoader(root, {
    '@/components/workspace-access': { useWorkspaceReadOnly: () => readOnly },
    '@/components/workflow-steps': { WorkflowSteps: () => null },
    '@/app/projects/[projectId]/publish/actions': { discoverIdeasAction: action, generatePostAction: action, refreshPostTitleAction: action, savePostEditAction: action, regeneratePostAction: action },
    '@/app/projects/[projectId]/results/actions': { confirmFindingsAction: action },
  });
  const { FindingsEditor } = load('@/app/projects/[projectId]/results/findings-editor');
  const confirmed = renderToStaticMarkup(React.createElement(FindingsEditor, { projectId: id, findingsId: id, initial: sourceWithNotes().latest.effectiveOutput, quick: true }));
  assert.match(confirmed, /补充你的判断/); assert.match(confirmed, /&quot;authorPerspective&quot;/);
  const { PublishEditor } = load('@/app/projects/[projectId]/publish/publish-editor');
  const html = renderToStaticMarkup(React.createElement(PublishEditor, { workspace, workflowState: { stages: {} } }));
  const forms = [...html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)].map(match => match[1]).filter(form => form.includes('name="ideaId"'));
  assert.equal(forms.length, 2);
  for (const form of forms) { assert.match(form, /name="authorPerspective"/); assert.ok(form.includes(notes.focus)); assert.doesNotMatch(form, /\[object Object\]/); }
  const { AuthorPerspectiveFields } = load('@/components/publish/author-perspective-fields');
  const fields = renderToStaticMarkup(React.createElement(AuthorPerspectiveFields, { onChange: () => {}, disabled: true }));
  assert.equal((fields.match(/<textarea/g) ?? []).length, 4);
  assert.doesNotMatch(fields, /required|<details[^>]*open=/); assert.match(fields, /<fieldset[^>]*disabled/);
  await h.run(); workspace.pack.post = h.state.saved; workspace.pack.status = 'ready';
  readOnly = true;
  const visitor = renderToStaticMarkup(React.createElement(PublishEditor, { workspace, workflowState: { stages: {} } }));
  assert.doesNotMatch(visitor, /补充你的判断|name="authorPerspective"/);
});

test('regeneration action decodes JSON and rejects malformed notes without dispatching a worker', async () => {
  let serviceArgs; let wakes = 0;
  const load = createLoader(root, {
    'next/headers': { headers: async () => new Headers({ 'x-ai-benchmark-access': 'admin' }) },
    'next/cache': { revalidatePath: () => {} },
    '@/lib/quick/dispatch': { wakeQuickWorker: () => { wakes++; } },
    '@/lib/services/publish.service': { enqueueCommunityPostRegeneration: async (...args) => { serviceArgs = args; } },
  });
  const action = load('@/app/projects/[projectId]/publish/actions').regeneratePostAction;
  const form = new FormData(); form.set('projectId', id); form.set('sourcePackId', id); form.set('authorPerspective', '{broken');
  assert.equal((await action({}, form)).success, false); assert.equal(wakes, 0); assert.equal(serviceArgs, undefined);
  form.set('authorPerspective', JSON.stringify(notes));
  assert.equal((await action({}, form)).success, true); assert.deepEqual(serviceArgs, [id, id, notes]); assert.equal(wakes, 1);
});
