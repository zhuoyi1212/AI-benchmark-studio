import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { communityStyleEditSchema, communityPostOutputSchema } from '../lib/ai/schemas/publish.schemas.ts';
import { pickStyleCopy, styleEditIssues } from '../lib/community-style-editor.ts';
import createLoader from '../scripts/lib/load-typescript.cjs';

const original = { title: '两次镜头试验', body: '衣服颜色\n\n这次生成了2段、每段5秒的片段，衣服颜色没有变化。\n\n一次试验不能证明稳定性。', interactionQuestion: '' };
const plan = { sections: [{ heading: '衣服颜色', observationQuote: '衣服颜色没有变化' }] };

test('language editing rejects metadata and preserves already clear copy', () => {
  assert.deepEqual(communityStyleEditSchema.parse(original), original);
  assert.deepEqual(styleEditIssues(original, original, plan), []);
  for (const field of ['editorialPlan', 'screenshotRecommendations', 'factCheck', 'stylePreservation', 'tags']) {
    assert.equal(communityStyleEditSchema.safeParse({ ...original, [field]: {} }).success, false);
  }
  assert.deepEqual(pickStyleCopy({ ...original, editorialPlan: plan }), original);
});

test('style guard rejects numeric drift and evidence anchor removal while allowing prose edits', () => {
  const edit = { ...original, body: original.body.replace('这次生成了', '本轮留下了') };
  assert.deepEqual(styleEditIssues(original, edit, plan), []);
  for (const body of [original.body.replace('5秒', '10秒'), original.body.replace('2段、', ''), original.body.replace('两次', '三次') + '成功率90%。', original.body.replace('衣服颜色没有变化', '省掉了后期调色'), original.body + '（p1）']) {
    assert.ok(styleEditIssues(original, { ...original, body }, plan).length);
  }
});

test('historical posts and three-stage traces remain readable without style metadata', () => {
  const route = { provider: 'zhipu', model: 'fixture', promptVersion: 'v1', inputSignature: 'fixture', usage: { inputTokens: null, outputTokens: null, latencyMs: 1, estimatedCost: null } };
  const post = { ...original, tags: ['创作'], screenshotRecommendations: [], generationTrace: ['planning', 'writing', 'fact_check'].map(stage => ({ ...route, stage })) };
  assert.equal(communityPostOutputSchema.safeParse(post).success, true);
});

test('repository passes style snapshots and independent review to existing atomic completion RPC', async () => {
  let request;
  const load = createLoader(fileURLToPath(new URL('..', import.meta.url)), {
    '@/lib/supabase/server': { getSupabaseServerClient: () => ({ rpc: async (name, input) => { request = { name, input }; return { error: null }; } }) },
  });
  const styleEdit = { original, edited: original, changed: false };
  const stylePreservation = { facts: true, scope: true, stance: true, experience: true, advice: true, evidence: true, issues: [] };
  await load('@/lib/repositories/publish.repository').publishRepository.complete('pack-fixture', { ...original, tags: ['创作'], screenshotRecommendations: [], styleEdit, stylePreservation }, {});
  assert.equal(request.name, 'complete_publish_pack');
  assert.deepEqual(request.input.p_community_post.styleEdit, styleEdit);
  assert.deepEqual(request.input.p_community_post.stylePreservation, stylePreservation);
});
