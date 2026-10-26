import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { harness, id, config, idea, quick } from './helpers/publication.mjs';
import { manualPostEditSchema } from '../lib/ai/schemas/publish.schemas.ts';
import { fileURLToPath } from 'node:url';
import createLoader from '../scripts/lib/load-typescript.cjs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

async function readyFixture() {
  const h = harness(); await h.run();
  return { id, version: 1, status: 'ready', config, content_ideas: [idea], selected_idea: idea, community_post: h.state.saved };
}

test('manual article saves are separate versions without an AI call or overwritten source', async () => {
  const readyPack = await readyFixture(); const original = structuredClone(readyPack);
  const h = harness({ readyPack });
  const input = { title: '沟通工具样本：加薪准备清单', body: '我重新整理了材料准备建议。', tags: ['沟通', '职场'], interactionQuestion: '你怎么准备？', imageIds: [] };
  const result = await h.load('@/lib/services/publish.service').saveCommunityPostEdit(id, id, input);
  assert.notEqual(result, id);
  assert.deepEqual(h.state.revision, [id, id, 'manual', { title: input.title, body: input.body, tags: input.tags, interactionQuestion: input.interactionQuestion }, []]);
  assert.deepEqual(readyPack, original); assert.equal(h.state.calls.length, 0); assert.equal(h.state.rawReads, 0);
});

test('manual saves reject stale versions, empty copy, duplicate/foreign images and unreadable internal identifiers', async () => {
  const readyPack = await readyFixture();
  const valid = { ...readyPack.community_post, imageIds: [] };
  const input = { title: valid.title, body: valid.body, tags: valid.tags, interactionQuestion: valid.interactionQuestion, imageIds: [] };
  for (const change of [{ body: '' }, { tags: [] }, { body: `内部 ${id}` }, { imageIds: [id, id] }, { imageIds: ['99999999-9999-4999-8999-999999999999'] }]) {
    const h = harness({ readyPack });
    await assert.rejects(h.load('@/lib/services/publish.service').saveCommunityPostEdit(id, id, { ...input, ...change }));
    assert.equal(h.state.revision, undefined);
  }
  const h = harness({ readyPack });
  await assert.rejects(h.load('@/lib/services/publish.service').saveCommunityPostEdit(id, '22222222-2222-4222-8222-222222222222', input), /版本已变化/);
});

test('saving image order drops removed claim anchors instead of inventing new evidence bindings', async () => {
  const readyPack = await readyFixture();
  readyPack.community_post.screenshotRecommendations = [{ artifactId: id, order: 1, reason: '证据', supportsClaim: '旧段落', supportsParagraph: 1 }];
  // Read links are replaced by the repository when loading; the new manual
  // image may be selected without asserting it proves new user-authored copy.
  const workspace = structuredClone(quick);
  workspace.artifacts[0].mimeType = 'image/png'; workspace.artifacts[0].fileUrl = 'https://fixture.invalid/image.png';
  const h = harness({ readyPack, workspace });
  await h.load('@/lib/services/publish.service').saveCommunityPostEdit(id, id, { title: '沟通工具样本：加薪准备建议', body: '新的人工整理内容。', tags: ['沟通'], interactionQuestion: '', imageIds: [id] });
  const links = h.state.revision[4];
  assert.equal(links[0].artifactId, id); assert.equal(links[0].supportsClaim, null); assert.equal(links[0].supportsParagraph, null); assert.equal(links[0].order, 1);
  readyPack.community_post.screenshotRecommendations[0].supportsClaim = '第一段。\n\n第二段。';
  const spanning = harness({ readyPack, workspace });
  await spanning.load('@/lib/services/publish.service').saveCommunityPostEdit(id, id, { title: '沟通工具样本：加薪准备建议', body: '第一段。\n\n第二段。', tags: ['沟通'], interactionQuestion: '', imageIds: [id] });
  assert.equal(spanning.state.revision[4][0].supportsParagraph, null);
});

test('save errors never claim success and regeneration is only enqueued without invoking AI', async () => {
  const readyPack = await readyFixture();
  const h = harness({ readyPack, revisionFailure: true });
  await assert.rejects(h.load('@/lib/services/publish.service').saveCommunityPostEdit(id, id, { title: readyPack.community_post.title, body: '修改稿', tags: ['沟通'], interactionQuestion: '', imageIds: [] }), /保存未完成/);
  const queued = harness({ readyPack });
  await queued.load('@/lib/services/publish.service').enqueueCommunityPostRegeneration(id, id);
  assert.deepEqual(queued.state.revision, [id, id, 'regenerate']); assert.equal(queued.state.calls.length, 0);
  assert.equal(manualPostEditSchema.safeParse({ body: '不完整' }).success, false);
});

test('regeneration can retry a failed job, but cannot replace a live revision or changed source', async () => {
  const readyPack = await readyFixture();
  readyPack.status = 'failed';
  readyPack.community_post.regeneration = { sourcePackId: id, jobId: id, requestedAt: '2026-10-12T00:00:00+00:00' };
  for (const status of ['running', 'failed']) {
    const h = harness({ readyPack, regenerationJob: { status } });
    const service = h.load('@/lib/services/publish.service');
    if (status === 'failed') await service.enqueueCommunityPostRegeneration(id, id);
    else await assert.rejects(service.enqueueCommunityPostRegeneration(id, id));
  }
  const h = harness({ readyPack });
  await assert.rejects(h.load('@/lib/services/publish.service').regeneratePreparedCommunityPost(id, '22222222-2222-4222-8222-222222222222'), /来源已变化/);
});

test('editor exposes persistent save/regeneration in both views and guards dirty edits', async () => {
  const editor = await readFile(new URL('../app/projects/[projectId]/publish/publish-editor.tsx', import.meta.url), 'utf8');
  const actions = await readFile(new URL('../app/projects/[projectId]/publish/actions.ts', import.meta.url), 'utf8');
  assert.match(editor, /form action=\{saveAction\}/); assert.match(editor, /form action=\{regenerateAction\}/);
  assert.match(editor, /先保存修改，再更换标题或重新生成/); assert.match(editor, /后台正在重新生成，当前显示上一版/);
  assert.match(actions, /headers\(\)\)\.get\('x-ai-benchmark-access'\) !== 'admin'/);
  assert.match(actions, /revalidatePath\(`\/projects\/\$\{ids.data.projectId\}\/quick`\)/);
});

test('public visitors cannot reach mutation services, and authenticated save failure preserves inputs', async () => {
  const form = new FormData(); form.set('projectId', id); form.set('sourcePackId', id);
  form.set('title', '人工编辑标题'); form.set('body', '人工编辑正文'); form.set('tags', '标签'); form.set('interactionQuestion', '');
  let calls = 0;
  const load = createLoader(fileURLToPath(new URL('..', import.meta.url)), {
    'next/headers': { headers: async () => new Headers({ 'x-ai-benchmark-access': 'read-only' }) },
    'next/cache': { revalidatePath: () => { throw new Error('Unauthorized invalidation'); } },
    'next/navigation': { redirect: () => { throw new Error('Unauthorized navigation'); } },
    '@/lib/quick/dispatch': { wakeQuickWorker: () => { throw new Error('Unauthorized worker'); } },
    '@/lib/services/publish.service': { saveCommunityPostEdit: async () => { calls++; }, enqueueCommunityPostRegeneration: async () => { calls++; } },
  });
  const actions = load('@/app/projects/[projectId]/publish/actions');
  for (const action of [actions.savePostEditAction, actions.regeneratePostAction]) {
    const result = await action({ message: null, success: false }, form);
    assert.equal(result.success, false); assert.match(result.message, /管理员/);
  }
  assert.equal(calls, 0); assert.equal(form.get('body'), '人工编辑正文');
});

test('both article views default to the same article preview and expose admin editing separately', async () => {
  const readyPack = await readyFixture();
  readyPack.community_post.manualEdit = { sourcePackId: id, savedAt: '2026-10-12T00:00:00Z', aiReviewed: false };
  const service = harness({ readyPack });
  const workspace = await service.load('@/lib/services/publish.service').getPublishWorkspace(id);
  let readOnly = false;
  const action = async () => ({ message: null });
  const load = createLoader(fileURLToPath(new URL('..', import.meta.url)), {
    '@/components/workspace-access': { useWorkspaceReadOnly: () => readOnly },
    '@/components/workflow-steps': { WorkflowSteps: () => null },
    '@/app/projects/[projectId]/publish/actions': { discoverIdeasAction: action, generatePostAction: action, refreshPostTitleAction: action, savePostEditAction: action, regeneratePostAction: action },
  });
  const { PublishEditor } = load('@/app/projects/[projectId]/publish/publish-editor.tsx');
  for (const quickView of [true, false]) {
    const html = renderToStaticMarkup(React.createElement(PublishEditor, { workspace, workflowState: { stages: {} }, quick: quickView }));
    assert.match(html, /编辑文章/); assert.match(html, /版本记录/); assert.match(html, /社区文章/);
    assert.doesNotMatch(html, /textarea|最终复核|事实核对/);
    assert.ok(html.includes(workspace.pack.post.body));
    assert.doesNotMatch(html, /已通过<\/span>/);
  }
  const withImage = structuredClone(workspace);
  withImage.pack.post.body = '开头已修改。\n\n材料准备建议在这一段。';
  withImage.pack.post.screenshotRecommendations = [{ artifactId: id, order: 1, reason: '原始证据', supportsClaim: '材料准备建议', supportsParagraph: 99 }];
  const marked = renderToStaticMarkup(React.createElement(PublishEditor, { workspace: withImage, workflowState: { stages: {} }, quick: true }));
  assert.match(marked, /材料准备建议/); assert.doesNotMatch(marked, /正文第 \d+ 段/);
  withImage.pack.post.body = '原来的证据短句已被删除。';
  const unmarked = renderToStaticMarkup(React.createElement(PublishEditor, { workspace: withImage, workflowState: { stages: {} }, quick: true }));
  assert.doesNotMatch(unmarked, /正文第 \d+ 段/);
  readOnly = true;
  const html = renderToStaticMarkup(React.createElement(PublishEditor, { workspace, workflowState: { stages: {} }, quick: true }));
  assert.doesNotMatch(html, /保存修改/); assert.doesNotMatch(html, /重新生成文章/);
  assert.doesNotMatch(html, /textarea|编辑文章|版本记录|从截图库选择/);
  assert.match(html, /社区文章/);
});
