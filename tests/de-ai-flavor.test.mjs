import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { harness, draft, review } from './helpers/publication.mjs';

test('the user-specified skill is pinned intact with its MIT attribution', async () => {
  const h = harness();
  const { deAiFlavorSource: source, deAiFlavorSkillText: text } = h.load('@/lib/ai/skills/de-ai-flavor-source');
  assert.equal(source.repository, 'https://github.com/masonweb3/de-ai-flavor');
  assert.equal(source.revision, 'b477196d9924db38c05bd0eeb85e4ac73eed87ac');
  assert.equal(createHash('sha256').update(text).digest('hex'), source.sha256);
  assert.equal(source.sha256, 'e1d905b4ef6592920a4e4bc047fb4ab6bd951b0d13d65c2ab8f81da1f7a29a63');
  const license = await readFile(new URL('../docs/third-party/de-ai-flavor-LICENSE.txt', import.meta.url), 'utf8');
  assert.match(license, /Copyright \(c\) 2026 Skillabs/);
  assert.match(license, /Permission is hereby granted/);
});

for (const professional of [false, true]) test(`the actual ${professional ? 'professional' : 'quick'} writing request includes the skill with project overrides and no extra stage`, async () => {
  const h = harness({ professional });
  await h.run();
  const { deAiFlavorSkillText } = h.load('@/lib/ai/skills/de-ai-flavor-source');
  const writer = h.state.calls.find(call => call.schemaName === 'CommunityPostDraft');
  assert.ok(writer.messages[0].content.includes(deAiFlavorSkillText));
  assert.ok(writer.messages[0].content.indexOf('以下项目契约优先') > writer.messages[0].content.indexOf(deAiFlavorSkillText));
  assert.match(writer.messages[0].content, /不执行原篇幅85%或±20%的凑字数下限/);
  for (const name of ['CommunityPostReview', 'EvidenceCheckedCommunityPost']) {
    const prompt = h.state.calls.find(call => call.schemaName === name).messages[0].content;
    assert.match(prompt, /de-ai-flavor的八项方法/);
    assert.match(prompt, /没有情绪记录不算缺陷/);
  }
  assert.equal(h.state.calls.length, 4);
  assert.equal(h.state.saved.body, draft.body);
  assert.equal(h.state.saved.contentPolicyVersion, 'community-story.v14-task-led-review');
  assert.equal(h.state.saved.body.includes('我觉得'), false);
  assert.equal(h.state.saved.body.includes('AI味浓度'), false);
});

test('a located language issue gets one skill-backed revision; removing redundant commentary has no length floor', async () => {
  const redundant = '准备材料和约时间的要求比较明确。这说明这份回答的准备建议是具体的，也满足了本次问题的要求。';
  const reason = '段末重复了已说清的准备判断。';
  const h = harness({ mutate: (stage, value) => {
    if (stage === 'CommunityPostDraft') return { ...value, body: value.body + '\n\n' + redundant };
    if (stage === 'CommunityPostReview') return { articleReview: { ...review, nonRepetitive: false, issues: [reason] }, issues: [{ field: 'body', quote: redundant, kind: 'language', reason, instruction: '删除该段，保留前文准备材料与约时间的具体要求。' }] };
    if (stage === 'CommunityPostRevision') return { title: draft.title, body: draft.body, interactionQuestion: '' };
    return value;
  } });
  await h.run();
  const revision = h.state.calls.find(call => call.schemaName === 'CommunityPostRevision');
  assert.ok(revision.messages[0].content.includes(h.load('@/lib/ai/skills/de-ai-flavor-source').deAiFlavorSkillText));
  assert.equal(h.state.calls.length, 5);
  assert.ok(h.state.saved.body.length < (draft.body.length + redundant.length) * 0.85);
  assert.equal(h.state.saved.body, draft.body);
  const audit = JSON.parse(h.state.calls.at(-1).messages[1].content);
  assert.equal(audit.draft.body, h.state.saved.body);
});

test('skill report fields cannot escape the structured article contract', async () => {
  const h = harness({ mutate: (stage, value) => stage === 'CommunityPostDraft' ? { ...value, aiFlavorScore: 20, diagnosis: '体检报告' } : value });
  await assert.rejects(h.run(), /撰写初稿/);
  assert.equal(h.state.saved, null);
  assert.equal(h.state.calls.length, 2);
});

test('de-ai editing cannot silently change a preserved source number', async () => {
  const h = harness({ mutate: (stage, value) => {
    if (stage === 'CommunityPostReview') return { ...value, issues: [{ field: 'body', quote: null, kind: 'language', reason: '改善衔接', instruction: '保留原始数字并调整句子。' }] };
    if (stage === 'CommunityPostRevision') return { title: draft.title, body: draft.body.replace('15分钟', '30分钟'), interactionQuestion: '' };
    return value;
  } });
  await assert.rejects(h.run(), /修订已发现的问题/);
  assert.equal(h.state.saved, null);
});

test('skill integration keeps author reactions evidence-bound and final review independent', async () => {
  const h = harness();
  const { firstPersonExperienceIssues } = h.load('@/lib/community-experience');
  const copy = { body: '我当时挺意外。' };
  assert.ok(firstPersonExperienceIssues(copy, {}).length);
  assert.deepEqual(firstPersonExperienceIssues(copy, { authorPerspective: { focus: copy.body } }), []);
  const rejected = harness({ mutate: (stage, value) => stage === 'EvidenceCheckedCommunityPost' ? { ...value, stylePreservation: { ...value.stylePreservation, experience: false } } : value });
  await assert.rejects(rejected.run(), /保真/);
  assert.equal(rejected.state.saved, null);
});
