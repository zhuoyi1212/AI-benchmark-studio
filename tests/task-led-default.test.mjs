import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { harness, review } from './helpers/publication.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');

test('the selected default contains the comparison card instructions without importing reference-video facts', async () => {
  const source = await readFile(new URL('../docs/research/turingscat-20261026/style-profile.json', import.meta.url), 'utf8');
  const profile = JSON.parse(source);
  const { taskLedReviewStyle: metadata, taskLedReviewStyleRules: rules } = harness().load('@/lib/community-task-led-style');
  assert.equal(metadata.selection, 'user_selected_default');
  assert.equal(metadata.sourceProfileSha256, hash(source));
  for (const rule of profile.rules) {
    assert.ok(rules.includes(rule.instruction));
    assert.ok(rules.includes(rule.apply_when));
  }
  assert.equal(rules.includes('本地对照候选'), false);
  assert.doesNotMatch(rules, /图灵的猫|bilibili|Seedream|S0[1-9]/);
});

for (const professional of [false, true]) test(`the ${professional ? 'professional' : 'quick'} pipeline applies the selected style once and revises only an unclear title`, async () => {
  const obscure = '沟通工具样本加薪实测：步骤都在后半';
  const clear = '沟通工具样本加薪实测：准备步骤具体';
  const h = harness({ professional, mutate(stage, value, input) {
    if (stage === 'CommunityPostDraft') return { ...value, title: obscure };
    if (stage === 'CommunityPostReview') return { articleReview: review, issues: [{ field: 'title', quote: obscure, kind: 'language', reason: '复述位置没有概括建议的实际内容', instruction: '用完整判断说明准备步骤具体，正文保持原样。' }] };
    if (stage === 'CommunityPostRevision') return { ...input.draft, title: clear };
    return value;
  } });
  await h.run();
  const rules = h.load('@/lib/community-task-led-style').taskLedReviewStyleRules;
  const titleRules = h.load('@/lib/community-title-policy');
  for (const stage of ['CommunityStoryBrief', 'CommunityPostDraft', 'CommunityPostRevision']) {
    const prompt = h.state.calls.find(call => call.schemaName === stage).messages[0].content;
    assert.equal(prompt.split(rules).length - 1, 1);
    assert.ok(prompt.includes(titleRules.communityTitleRules));
    assert.match(prompt, /布局符合指令/);
    assert.match(prompt, /不能扩成/);
  }
  for (const stage of ['CommunityPostReview', 'EvidenceCheckedCommunityPost']) {
    const prompt = h.state.calls.find(call => call.schemaName === stage).messages[0].content;
    assert.equal(prompt.includes(rules), false, 'Independent audits do not become creative writing instructions');
    assert.ok(prompt.includes(titleRules.communityTitleReviewRules));
    assert.match(prompt, /残句、省略判断对象/);
  }
  assert.equal(h.state.calls.length, 5);
  assert.equal(h.state.saved.contentPolicyVersion, 'community-story.v14-task-led-review');
  assert.equal(h.state.saved.title, clear);
  assert.equal(h.state.saved.body, h.state.saved.styleEdit.original.body);
});

test('the adopted local title is an explicit editorial revision and preserves the preferred second body', async () => {
  const root = new URL('../docs/project-articles/2026-10-26即梦新图两版对照/', import.meta.url);
  const report = JSON.parse(await readFile(new URL('生成核验.json', root), 'utf8'));
  const record = JSON.parse(await readFile(new URL('采用稿记录.json', root), 'utf8'));
  const preferred = report.runs.find(run => run.variant === 'style-card');
  const markdown = await readFile(new URL('采用稿.md', root), 'utf8');
  assert.equal(record.previousTitle, preferred.title);
  assert.equal(record.bodySha256, preferred.bodySha256);
  assert.equal(record.sourceBodySha256, hash(preferred.body));
  assert.equal(markdown, `# ${record.title}\n\n${preferred.body}\n`);
  assert.equal(hash(markdown), record.markdownSha256);
  assert.match(record.title, /文字准确，布局符合指令/);
  assert.ok(Array.from(record.title).length <= 28);
  assert.equal(record.aiTitleReviewed, false);
  assert.equal(record.appWrites, 0);
  assert.equal(record.authorSceneStillUnconfirmed, true);
});
