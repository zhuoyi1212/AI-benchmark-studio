import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { harness, draft, rawEvidence, review, preservation, id, findings } from './helpers/publication.mjs';

for (const professional of [false, true]) test(`sharing guidance reaches ${professional ? 'professional' : 'quick'} discovery and writing without report data`, async () => {
  const h = harness({ professional });
  await h.discover();
  assert.equal(h.state.discoveryStarted, true);
  assert.equal(h.state.discoveredIdeas.length, 1);
  assert.match(h.state.calls[0].messages[0].content, /社区分享的中心是一个具体用途/);
  h.state.calls.length = 0;
  await h.run();
  for (const call of h.state.calls) {
    assert.match(call.messages[0].content, call.schemaName.includes('Review') || call.schemaName === 'EvidenceCheckedCommunityPost' ? /按社区分享的读者价值审稿/ : /社区分享的中心是一个具体用途/);
  }
  const writer = JSON.parse(h.state.calls[1].messages[1].content);
  assert.equal(writer.originalDetails, rawEvidence);
  assert.ok(!JSON.stringify(writer).includes('DO NOT SEND'));
  assert.equal(h.state.saved.body, draft.body);
  assert.equal(h.state.saved.contentPolicyVersion, 'community-story.v14-task-led-review');
  assert.equal(h.state.calls.length, 4);
});

test('a brief can omit a redundant ending while its scope and main evidence remain required', async () => {
  const h = harness({ mutate: (stage, value) => stage === 'CommunityStoryBrief' ? { ...value, ending: '' } : value });
  await h.run();
  const { storyBriefSchema } = h.load('@/lib/ai/schemas/publish.schemas');
  const brief = h.state.saved.storyBrief;
  assert.equal(brief.ending, '');
  for (const change of [{ scope: '' }, { supportingPoints: [] }, { ending: undefined }]) {
    assert.equal(storyBriefSchema.safeParse({ ...brief, ...change }).success, false);
  }
});

for (const authorizedDeletion of [true, false]) test(`irrelevant numeric parameter deletion ${authorizedDeletion ? 'follows an exact editorial instruction' : 'cannot bypass detail retention'}`, async () => {
  const parameter = '文件尺寸是1728×2304。';
  const reason = '这个参数与准备沟通无关。';
  const h = harness({ raw: `${rawEvidence}\n${parameter}`, mutate: (stage, value) => {
    if (stage === 'CommunityPostDraft') return { ...value, body: value.body + parameter };
    if (stage === 'CommunityPostReview') return { articleReview: { ...review, nonRepetitive: false, issues: [reason] }, issues: [{ field: 'body', quote: parameter, kind: 'language', reason, instruction: authorizedDeletion ? '删除该句，保留任务中的3个硬数字与15分钟。' : '调整衔接。' }] };
    if (stage === 'CommunityPostRevision') return { title: draft.title, body: draft.body, interactionQuestion: '' };
    return value;
  } });
  if (!authorizedDeletion) {
    await assert.rejects(h.run(), /修订已发现的问题/);
    const revision = h.state.calls.at(-1);
    assert.equal(revision.schemaName, 'CommunityPostRevision');
    const result = revision.schema.safeParse({ title: draft.title, body: draft.body, interactionQuestion: '' });
    assert.equal(result.success, false);
    assert.ok(result.error.issues.some(issue => issue.message.includes('具体细节丢失')));
    assert.equal(h.state.saved, null);
    return;
  }
  await h.run();
  assert.equal(h.state.calls.length, 5);
  const revision = h.state.calls.find(c => c.schemaName === 'CommunityPostRevision');
  assert.match(revision.messages[0].content, /社区分享的中心是一个具体用途/);
  const final = JSON.parse(h.state.calls.at(-1).messages[1].content);
  assert.equal(final.draft.body, draft.body);
  assert.equal(h.state.saved.body, final.draft.body);
  assert.match(h.state.saved.body, /3个硬数字/);
  assert.match(h.state.saved.body, /15分钟/);
});

test('image planning and both read-only audits receive sharing guidance and the same original image', async () => {
  const image = { type: 'image_url', image_url: { url: 'https://example.invalid/synthetic.png' } };
  const h = harness({ raw: [{ type: 'text', text: rawEvidence }, image] });
  await h.run();
  for (const index of [0, 2, 3]) {
    const content = h.state.calls[index].messages.flatMap(m => Array.isArray(m.content) ? m.content : []);
    assert.ok(content.some(part => part.type === 'image_url' && part.image_url.url === image.image_url.url));
  }
  assert.match(h.state.calls[1].messages[0].content, /图像、界面或实际文件的任务不强求有产品引语/);
  assert.match(h.state.calls[1].messages[0].content, /不禁止有用的步骤编号/);
});

test('direct sharing guidance cannot make an evidence-failing final copy ready', async () => {
  const reason = '此判断超出原始证据。';
  const h = harness({ mutate: (stage, value) => stage === 'EvidenceCheckedCommunityPost' ? {
    ...value, stylePreservation: { ...preservation, scope: false, issues: [reason] },
    issues: [{ field: 'body', quote: draft.body, kind: 'scope', reason, instruction: '收窄到本次回答。' }],
  } : value });
  await assert.rejects(h.run(), /最终稿未通过/);
  assert.equal(h.state.saved, null);
  assert.match(h.state.failure, /此判断超出原始证据/);
});

test('prompt inventory contains the actual sharing prompts, including review and repair boundaries', async () => {
  const h = harness();
  const policy = h.load('@/lib/community-story-policy');
  const inventory = await readFile(new URL('../docs/ai-prompt-inventory.md', import.meta.url), 'utf8');
  for (const key of ['storyBriefRules', 'storyWritingRules', 'storyReviewRules', 'targetedRevisionRules', 'storyFinalAuditRules']) {
    assert.ok(inventory.includes(policy[key]), key);
  }
  assert.match(policy.storyWritingRules, /不得借用其产品能力、人物身份、数字、经历、引文或结论/);
  assert.match(policy.storyWritingRules, /感受、情绪、耗时、操作次数、偏好与手改经历仍需作者输入或测试记录/);
});

test('sharing prompts survive Task Service, Router and Provider serialization with an isolated fetch transport', async (t) => {
  const requests = [];
  const base = 'http://127.0.0.1:19234';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).origin, base, 'Synthetic evidence must stay in the isolated fetch transport');
    const body = JSON.parse(options.body);
    assert.equal(options.headers.Authorization, 'Bearer e2e-local-provider-boundary');
    const schema = body.messages[0].content.match(/for schema ([^:]+):/)[1];
    requests.push({ schema, path: new URL(url).pathname, body });
    const input = JSON.parse(body.messages.find(m => m.role === 'user' && typeof m.content === 'string' && m.content.startsWith('{')).content);
    let result;
    if (schema === 'CommunityStoryBrief') result = { readerQuestion: '如何准备预算紧张时的加薪沟通？', targetReader: '准备沟通的人', spine: '准备步骤具体', supportingPoints: [{ claim: '准备步骤具体', readerValue: findings[0].impact, findingIds: [input.factLedger[0].id], evidenceArtifactIds: [id], detail: findings[0].observation, role: 'main' }], corePromiseGaps: ['没有实际沟通结果'], scope: '只限本次回答', ending: '', avoidClaims: [], comparison: false };
    else if (schema === 'CommunityPostDraft') result = { title: draft.title, body: `${draft.body}\n\n${draft.body}`, tags: draft.tags, interactionQuestion: '' };
    else if (schema === 'CommunityPostReview') result = { articleReview: review, issues: [] };
    else if (schema === 'CommunityPostRevision') result = { title: draft.title, body: draft.body, interactionQuestion: '' };
    else if (schema === 'EvidenceCheckedCommunityPost') result = { articleReview: review, stylePreservation: preservation, screenshotRecommendations: [], issues: [] };
    else throw new Error(`Unexpected schema ${schema}`);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 20 } }), { headers: { 'content-type': 'application/json' } });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const variables = { AI_E2E_PROVIDER_BASE_URL: base, E2E_TEST_MODE: '1', ZAI_API_KEY: 'synthetic-fixture', DEEPSEEK_API_KEY: 'synthetic-fixture', MOONSHOT_API_KEY: 'synthetic-fixture' };
  const previous = Object.fromEntries(Object.keys(variables).map(key => [key, process.env[key]]));
  Object.assign(process.env, variables);
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  const h = harness({ realAI: true });
  await h.run();
  assert.deepEqual(requests.map(r => r.schema), ['CommunityStoryBrief', 'CommunityPostDraft', 'CommunityPostReview', 'CommunityPostRevision', 'EvidenceCheckedCommunityPost']);
  assert.equal(requests.filter(r => r.path === '/moonshot/chat/completions').length, 2);
  for (const request of requests) assert.ok(request.body.messages.some(m => typeof m.content === 'string' && /社区分享的中心是一个具体用途|按社区分享的读者价值审稿/.test(m.content)));
  const { deAiFlavorSkillText } = h.load('@/lib/ai/skills/de-ai-flavor-source');
  const { taskLedReviewStyleRules } = h.load('@/lib/community-task-led-style');
  for (const request of requests.filter(r => ['CommunityStoryBrief', 'CommunityPostDraft', 'CommunityPostRevision'].includes(r.schema))) {
    assert.equal(request.body.messages.filter(message => typeof message.content === 'string' && message.content.includes(taskLedReviewStyleRules)).length, 1);
  }
  for (const request of requests.filter(r => ['CommunityPostDraft', 'CommunityPostRevision'].includes(r.schema))) {
    assert.ok(request.body.messages.some(message => typeof message.content === 'string' && message.content.includes(deAiFlavorSkillText)));
    assert.ok(request.body.messages.some(message => typeof message.content === 'string' && message.content.includes('以下项目契约优先')));
  }
  assert.equal(h.state.saved.body, draft.body);
  assert.equal(h.state.saved.storyBrief.ending, '');
  assert.ok(h.state.saved.generationTrace.every(trace => /community-sharing|task-led-review|clear-result-titles/.test(trace.promptVersion)));
  assert.equal(JSON.parse(requests.at(-1).body.messages[2].content).draft.body, draft.body);
});
