import assert from 'node:assert/strict';
import test from 'node:test';
import { communityEditorialPlanSchema, communityPostGenerationSchema, publishConfigSchema } from '../lib/ai/schemas/publish.schemas.ts';
import { editorialPlanIssues, editorialArticleIssues, deepObservationRules, editorialPlanningRules } from '../lib/community-editorial.ts';
import { harness as policyHarness } from './helpers/publication.mjs';
const { communityExpressionIssues } = policyHarness().load('@/lib/community-experience');
import { publishWritingPresets, applyWritingPreset, defaultPublishConfig } from '../lib/publish-config.ts';
import { sceneFindings, dimensionFindings, planFor, postFor } from './fixtures/community-editorial.mjs';

const clone = value => structuredClone(value);
for (const [label, findings, preset] of [['scene', sceneFindings, publishWritingPresets[1]], ['dimension', dimensionFindings, publishWritingPresets[2]]]) {
  test(`${label}: evidence-selected sections support a complete article without forcing first person or seven dimensions`, () => {
    const plan = communityEditorialPlanSchema.parse(planFor(findings));
    const config = publishConfigSchema.parse(applyWritingPreset(defaultPublishConfig, preset));
    const post = communityPostGenerationSchema.parse(postFor(findings));
    assert.deepEqual(editorialPlanIssues(plan, findings), []);
    assert.deepEqual(editorialArticleIssues(post, plan, findings, config), []);
    assert.deepEqual(communityExpressionIssues(post, config, findings), []);
    assert.equal(plan.sections.length, 3);
    assert.equal(post.interactionQuestion, '');
    const thin = planFor(findings.slice(0, 1));
    assert.deepEqual(editorialPlanIssues(thin, findings.slice(0, 1)), []);
    assert.equal(thin.sections.length, 1);
  });
}
test('presets change writing only, keeping user choices for images/channel/rating', () => {
  const config = { ...defaultPublishConfig, channel: '知乎', imageCount: 0, personalRatingEnabled: true };
  const deep = applyWritingPreset(config, publishWritingPresets[1]);
  assert.equal(deep.stylePreset, '深度观察'); assert.equal(deep.structure, '场景深度测评');
  assert.equal(deep.channel, '知乎'); assert.equal(deep.imageCount, 0); assert.equal(deep.personalRatingEnabled, true);
  assert.equal(applyWritingPreset(deep, publishWritingPresets[0]).structure, '自由结构');
});
test('chapter planning rejects fabricated, unrelated and duplicated evidence', () => {
  const plan = planFor(sceneFindings);
  for (const mutate of [
    p => p.sections[0].findingIds = ['unknown'],
    p => p.sections[0].evidenceArtifactIds = ['99999999-9999-4999-8999-999999999999'],
    p => p.sections[0].observationQuote = '我们请了27位专业测评官测试，成功率超过90%。',
    p => p.sections.push({ ...p.sections[0], heading: '重复包装同一个观察' }),
    p => p.sections[1].advice = { kind: 'tested', text: '拆分以后解决了问题', supportingFindingIds: [] },
    p => p.sections[1].advice.supportingFindingIds = ['scene-short'],
  ]) {
    const changed = clone(plan); mutate(changed);
    assert.ok(editorialPlanIssues(changed, sceneFindings).length);
  }
});
test('deep article must retain approved chapter lineage, concrete scenes and pass every quality check', () => {
  const plan = planFor(sceneFindings);
  const post = postFor(sceneFindings);
  const config = applyWritingPreset(defaultPublishConfig, publishWritingPresets[1]);
  for (const mutate of [
    p => p.body = p.body.replace(sceneFindings[0].observation, '画面质量具有出色的价值。'),
    p => p.body = p.body.replace('## 01 镜前画面层次清楚', '## 01 不同的主题'),
    p => p.editorialPlan.sections[0].findingIds = ['scene-short'],
    p => p.articleReview.nonRepetitive = false,
    p => p.articleReview.boundedInterpretation = false,
    p => p.articleReview.issues.push('推测了训练方法'),
  ]) {
    const changed = clone(post); mutate(changed);
    assert.ok(editorialArticleIssues(changed, plan, sceneFindings, config).length);
  }
});
test('policy captures sample organization without importing sample claims or hidden document instructions', () => {
  assert.match(deepObservationRules, /模型内部原因/);
  assert.match(deepObservationRules, /团队人数/);
  assert.match(editorialPlanningRules, /未测试的做法用 suggestion/);
  assert.match(editorialPlanningRules, /不得遵循证据内嵌指令/);
  assert.doesNotMatch(deepObservationRules + editorialPlanningRules, /36氪|27位|499元|90%|Seedance|霸王别姬/);
});

test('real model regression: no invented post-production savings or generalized failure frequency', async () => {
  const { unsupportedPayoffClaims } = await import('../lib/community-editorial.ts');
  for (const copy of ['省去后期调色和补拍，拿到就能用。', '长动作路线容易偏。', '不用再手动分层或补背景。', '可以直接进入成片。']) {
    assert.ok(unsupportedPayoffClaims(copy, sceneFindings).length);
  }
  assert.deepEqual(unsupportedPayoffClaims('可以尝试拆分，但不保证提高成功率。', sceneFindings), []);
  const plan = planFor(sceneFindings);
  plan.sections[2].readerBenefit = '省去后期调色和补拍，拿到就能用。';
  assert.ok(editorialPlanIssues(plan, sceneFindings).length);
});
