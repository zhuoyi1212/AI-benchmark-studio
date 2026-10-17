import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import createLoader from '../scripts/lib/load-typescript.cjs';
import { locatedPublicationAuditSchema, storyReviewSchema } from '../lib/ai/schemas/publish.schemas.ts';
import { unsupportedPublicationClaims } from '../lib/community-content-policy.ts';
import { harness, draft, review, preservation, config, id, idea } from './helpers/publication.mjs';
const { locatedReviewOutputRules, storyReviewRules, storyFinalAuditRules } = harness().load('@/lib/community-story-policy');

const reason = '最终稿仍有无依据的引用建议';
const audit = { articleReview: { ...review, issues: [reason] }, stylePreservation: preservation, screenshotRecommendations: [],
  issues: [{ field: 'body', quote: '可核对后引用', kind: 'scope', reason, instruction: '缩小范围' }] };

test('Yuanbao regression: a phrase present only in the brief cannot block final copy', () => {
  const copy = { ...draft, body: '只查了三个限制，发布前自己打开官网看一眼。' };
  assert.equal(locatedPublicationAuditSchema(copy).safeParse(audit).success, false);
  assert.equal(locatedPublicationAuditSchema({ ...copy, body: '这些结果可核对后引用。' }).safeParse(audit).success, true);
  assert.equal(locatedPublicationAuditSchema(copy).safeParse({ ...audit, issues: [] }).success, false);
  assert.equal(locatedPublicationAuditSchema(copy).safeParse({ ...audit, issues: [{ ...audit.issues[0], quote: null }] }).success, false);
  assert.equal(locatedPublicationAuditSchema(copy).safeParse({ ...audit, issues: [{ ...audit.issues[0], kind: 'weight', quote: null }] }).success, false);
});

test('one bounded same-provider audit repair can correct a phantom quote; unrepaired outputs stay failed', async () => {
  for (const repaired of [true, false]) {
    const requests = [];
    class Provider {
      async generateStructured(request) {
        requests.push(request);
        const value = repaired && requests.length === 2
          ? { articleReview: review, stylePreservation: preservation, screenshotRecommendations: [], issues: [] } : audit;
        return { content: JSON.stringify(value), finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1, latencyMs: 1, estimatedCost: null } };
      }
    }
    const load = createLoader(fileURLToPath(new URL('..', import.meta.url)), {
      '@/lib/ai/config': { resolveAITaskRoute: task => ({ task, provider: 'deepseek', model: 'fixture', promptVersion: 'fixture', reasoning: 'standard', timeoutMs: 1000, maxAttempts: 2 }) },
      '@/lib/env/server': { getAIProviderKey: () => 'fixture' },
      '@/lib/ai/providers/deepseek.provider': { DeepSeekProvider: Provider },
    });
    const run = () => load('@/lib/ai/router').runStructuredAITask('community_post_evidence_check_text', {
      schema: locatedPublicationAuditSchema(draft), schemaName: 'EvidenceCheckedCommunityPost', maxAttempts: 2,
      messages: [{ role: 'user', content: JSON.stringify({ storyBrief: { ending: '可核对后引用' }, draft }) }],
    });
    if (repaired) assert.deepEqual((await run()).data.issues, []);
    else await assert.rejects(run());
    assert.equal(requests.length, 2);
  }
});

test('review-shape repair distinguishes issue objects from summaries and retains images for vision routes', async () => {
  const requests = [];
  const problem = { field: 'body', quote: '准备材料', kind: 'fact', reason: '待修正文问题', instruction: '按证据修正' };
  class Provider {
    async generateStructured(request) {
      requests.push(request);
      return { content: JSON.stringify({ articleReview: { ...review, issues: [problem.reason] }, issues: requests.length === 1 ? [problem.reason] : [problem] }),
        finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1, latencyMs: 1, estimatedCost: null } };
    }
  }
  const load = createLoader(fileURLToPath(new URL('..', import.meta.url)), {
    '@/lib/ai/config': { resolveAITaskRoute: task => ({ task, provider: 'zhipu', model: 'fixture', promptVersion: 'fixture', reasoning: 'standard', timeoutMs: 1000, maxAttempts: 2 }) },
    '@/lib/env/server': { getAIProviderKey: () => 'fixture' },
    '@/lib/ai/providers/zhipu.provider': { ZhipuProvider: Provider },
  });
  const result = await load('@/lib/ai/router').runStructuredAITask('community_post_evidence_check', {
    schema: storyReviewSchema, schemaName: 'CommunityPostReview', maxAttempts: 2, validationRepairInstruction: locatedReviewOutputRules,
    messages: [{ role: 'system', content: storyReviewRules }, { role: 'user', content: JSON.stringify({ draft }) },
      { role: 'user', content: [{ type: 'image_url', image_url: { url: 'https://fixture.invalid/evidence.png' } }] }],
  });
  assert.deepEqual(result.data.issues, [problem]);
  assert.equal(requests.length, 2);
  const active = requests[1].messages.at(-1).content;
  assert.equal(active.filter(part => part.type === 'image_url').length, 1);
  assert.ok(active.some(part => part.type === 'text' && part.text.includes('根对象 issues 必须是问题对象数组')));
  assert.ok(storyReviewRules.includes(locatedReviewOutputRules));
  assert.ok(storyFinalAuditRules.includes(locatedReviewOutputRules));
});

test('actual final audit issues remain failures and are shown as concrete reasons', async () => {
  const h = harness({ mutate: (stage, value) => stage === 'EvidenceCheckedCommunityPost' ? {
    ...value, articleReview: { ...review, boundedInterpretation: false, issues: [reason] },
    issues: [{ ...audit.issues[0], quote: '准备材料和约时间有了明确要求' }],
  } : value });
  await assert.rejects(h.run(), /最终稿仍有无依据的引用建议/);
  assert.equal(h.state.saved, null);
  assert.match(h.state.failure, /最终稿仍有无依据的引用建议/);
});

test('revision is checked immediately: synonymous unsupported claims do not reach final audit', async () => {
  const h = harness({ mutate: (stage, value) => stage === 'CommunityPostDraft' ? { ...value, body: value.body + '这轮不用重写文案。' }
    : stage === 'CommunityPostRevision' ? { ...value, body: draft.body + '这轮内容本身不用改。' } : value });
  await assert.rejects(h.run(), /修订已发现的问题/);
  assert.equal(h.state.calls.some(call => call.schemaName === 'EvidenceCheckedCommunityPost'), false);
  assert.equal(h.state.saved, null);
});

test('Dongni live regression: newly introduced report filler is checked during revision, before final audit', async () => {
  const h = harness({ mutate: (stage, value) => stage === 'CommunityPostReview' ? {
    ...value, issues: [{ field: 'body', quote: null, kind: 'structure', reason: '需要补充范围说明', instruction: '补充未测事项' }],
  } : stage === 'CommunityPostRevision' ? { ...value, body: value.body + '值得注意的是，本次没有验证实际沟通效果。' } : value });
  await assert.rejects(h.run(), /修订已发现的问题/);
  const schema = h.state.calls.find(call => call.schemaName === 'CommunityPostRevision').schema;
  const invalid = schema.safeParse({ title: draft.title, body: draft.body + '值得注意的是，本次没有验证实际沟通效果。', interactionQuestion: '' });
  assert.equal(invalid.success, false);
  assert.ok(invalid.error.issues.some(issue => issue.message.includes('值得注意的是')));
  assert.equal(h.state.calls.some(call => call.schemaName === 'EvidenceCheckedCommunityPost'), false);
  assert.equal(h.state.saved, null);
});

test('topic wording is permitted while unsupported behavior, savings and percentages stay blocked', () => {
  assert.deepEqual(unsupportedPublicationClaims({ ...draft, body: '容易踩的坑：先看来源。' }, [], []), []);
  for (const body of ['模型容易出错。', '不用额外修改文案。', '成功率提升到99%。', '经常漏掉来源。']) {
    assert.ok(unsupportedPublicationClaims({ ...draft, body }, [], []).length, body);
  }
});

test('stale generation request is rejected before reading evidence or changing pack state', async () => {
  const h = harness();
  await assert.rejects(h.load('@/lib/services/publish.service').generateCommunityPost(id, { ideaId: 'idea-1', config, expectedPackId: '22222222-2222-4222-8222-222222222222' }), /版本已变化/);
  assert.equal(h.state.rawReads, 0); assert.equal(h.state.failure, null); assert.equal(h.state.calls.length, 0);
});

test('retrying the current failed pack binds its new immutable version before generation', async () => {
  const pack = { id, status: 'failed', content_ideas: [idea], config, community_post: null };
  const job = { kind: 'publish', id, payload: { packId: id } };
  const h = harness({ readyPack: pack, execution: { job } });
  const generated = await h.load('@/lib/services/publish.service').generateCommunityPost(id, { ideaId: idea.id, config, expectedPackId: id });
  assert.notEqual(generated, id);
  assert.equal(job.payload.packId, generated);
  assert.equal(h.state.boundPackId, generated);
  assert.equal(pack.status, 'failed');
  assert.ok(h.state.saved);
});

test('expired worker cannot bind a different target or change its local payload', async () => {
  for (const live of [false, true]) {
    const filters = [];
    const query = Object.fromEntries(['eq', 'gt'].map(key => [key, (...args) => { filters.push([key, ...args]); return query; }]));
    query.select = async () => ({ data: live ? [{ id }] : [], error: null });
    let update;
    const load = createLoader(fileURLToPath(new URL('..', import.meta.url)), {
      '@/lib/supabase/server': { getSupabaseServerClient: () => ({ from: () => ({ update: value => { update = value; return query; } }) }) },
    });
    const job = { id, lease_token: 'owned-lease', payload: { packId: 'old', config } };
    const run = () => load('@/lib/repositories/quick-jobs.repository').quickJobsRepository.bindPublishPack(job, id);
    if (live) await run(); else await assert.rejects(run(), /执行权已过期/);
    assert.equal(job.payload.packId, live ? id : 'old');
    assert.equal(update.payload.packId, id);
    assert.ok(filters.some(f => f[1] === 'lease_token' && f[2] === 'owned-lease'));
    assert.ok(filters.some(f => f[1] === 'status' && f[2] === 'running'));
    assert.ok(filters.some(f => f[0] === 'gt' && f[1] === 'lease_until'));
  }
});
