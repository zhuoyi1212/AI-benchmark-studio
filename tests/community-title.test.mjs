import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { harness, id, idea, config } from './helpers/publication.mjs';
import { communityTitleRules, communityTitleReviewRules } from '../lib/community-title-policy.ts';

test('published prompt inventory matches the exact title-aware production prompts', async () => {
  const h = harness();
  const policy = h.load('@/lib/community-story-policy');
  const titles = h.load('@/lib/community-title-policy');
  const inventory = await readFile(new URL('../docs/ai-prompt-inventory.md', import.meta.url), 'utf8');
  for (const prompt of [policy.storyBriefRules, policy.storyWritingRules, policy.storyReviewRules, policy.targetedRevisionRules, policy.storyFinalAuditRules, titles.communityTitleRefreshRules]) {
    assert.ok(inventory.includes(prompt));
  }
});

test('summary title policy reaches planning, writing, targeted revision and both independent reviews', async () => {
  const obscureTitle = '沟通工具样本：提示里的数字还得改';
  const summaryTitle = '沟通工具样本加薪实测：准备建议具体';
  const h = harness({ mutate(stage, value, input) {
    if (stage === 'CommunityPostDraft') return { ...value, title: obscureTitle };
    if (stage === 'CommunityPostReview') return { ...value, issues: [{ field: 'title', quote: obscureTitle, kind: 'weight', reason: '小摩擦替代测评内容，未交代用途', instruction: '概括加薪准备建议的主要结果' }] };
    if (stage === 'CommunityPostRevision') return { ...input.draft, title: summaryTitle };
    return value;
  } });
  await h.run();
  for (const stage of ['CommunityStoryBrief', 'CommunityPostDraft', 'CommunityPostRevision']) {
    assert.ok(h.state.calls.find(c => c.schemaName === stage).messages[0].content.includes(communityTitleRules));
  }
  for (const stage of ['CommunityPostReview', 'EvidenceCheckedCommunityPost']) {
    assert.ok(h.state.calls.find(c => c.schemaName === stage).messages[0].content.includes(communityTitleReviewRules));
  }
  assert.equal(h.state.saved.title, summaryTitle);
  assert.equal(h.state.saved.body, h.state.saved.styleEdit.original.body);
  assert.equal(h.state.saved.styleEdit.original.title, obscureTitle);
  assert.equal(h.state.saved.generationTrace.length, 5);
});

test('title-only refresh uses verified body over a historical friction angle and creates a new version', async () => {
  const initial = harness();
  await initial.run();
  const post = { ...initial.state.saved, title: '沟通工具样本：提示里的数字还得改' };
  const readyPack = { id, version: 1, status: 'ready', content_ideas: [idea], selected_idea: { ...idea, title: '提示里的数字还得改' }, config, community_post: post };
  const snapshot = structuredClone(readyPack);
  const h = harness({ readyPack });
  const result = await h.load('@/lib/services/publish.service').refreshCommunityPostTitle(id, id);
  assert.equal(h.state.calls.length, 1);
  const call = h.state.calls[0];
  assert.equal(call.schemaName, 'CommunityPostTitle');
  assert.ok(call.messages[0].content.includes(communityTitleRules));
  assert.match(call.messages[0].content, /articleBody 是本次标题的事实与主次依据/);
  const input = JSON.parse(call.messages[1].content);
  assert.equal(input.articleBody, post.body);
  assert.deepEqual(input.avoidTitles, [post.title]);
  assert.equal(Object.hasOwn(input, 'centralIdea'), false);
  assert.equal(Object.hasOwn(input, 'storyBrief'), false);
  assert.equal(input.requirements.includeTestPurpose, true);
  assert.equal(input.requirements.prioritizeMainResult, true);
  assert.equal(Object.hasOwn(input.requirements, 'concreteHook'), false);
  assert.equal(h.state.rawReads, 0);
  assert.equal(h.state.saved, null);
  assert.deepEqual(readyPack, snapshot);
  assert.notEqual(result.packId, id);
  assert.equal(h.state.refreshed.sourceId, id);
  assert.equal(h.state.refreshed.audit.previousTitle, post.title);
  assert.equal(h.state.refreshed.audit.title, result.title);
  assert.ok(h.state.refreshed.audit.inputSignature);
});

test('refresh still rejects unchanged titles, missing product names and unsupported result numbers before saving', async () => {
  const initial = harness();
  await initial.run();
  const readyPack = { id, version: 1, status: 'ready', content_ideas: [idea], selected_idea: idea, config, community_post: initial.state.saved };
  for (const title of [readyPack.community_post.title, '加薪准备实测：建议很具体', '沟通工具样本加薪实测：成功率99%']) {
    const h = harness({ readyPack, mutate: (stage, value) => stage === 'CommunityPostTitle' ? { ...value, title } : value });
    await assert.rejects(h.load('@/lib/services/publish.service').refreshCommunityPostTitle(id, id));
    assert.equal(h.state.refreshed, undefined);
  }
});
