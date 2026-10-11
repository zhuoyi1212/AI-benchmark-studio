import assert from 'node:assert/strict';
import test from 'node:test';
import { storyBriefSchema, storyReviewSchema } from '../lib/ai/schemas/publish.schemas.ts';
import { harness, config, id, quick, rawEvidence, draft } from './helpers/publication.mjs';

const issue = { field: 'body', quote: null, kind: 'fact', reason: '推测机制写成事实', instruction: '删除未验证的机制' };

test('brief is validated before writing: invented sources or foreign artifact cannot publish', async () => {
  for (const field of ['findingIds', 'evidenceArtifactIds']) {
    const h = harness({ mutate: (stage, value) => stage === 'CommunityStoryBrief' ? { ...value, supportingPoints: [{ ...value.supportingPoints[0], [field]: ['99999999-9999-4999-8999-999999999999'] }] } : value });
    await assert.rejects(h.run(), /文章主线/);
    assert.equal(h.state.calls.length, 1);
    assert.equal(h.state.saved, null);
  }
});

test('writer receives actual raw details and a validated brief, not just finding summaries', async () => {
  const detail = '\n产品原话：请把目标日期写成下周五。';
  const h = harness({ raw: rawEvidence + detail });
  await h.run();
  const input = JSON.parse(h.state.calls[1].messages[1].content);
  assert.ok(input.originalDetails.includes(detail));
  assert.equal(input.storyBrief.readerQuestion, h.state.saved.storyBrief.readerQuestion);
  assert.deepEqual(h.state.rawOptions.testCaseIds, [id]);
  assert.deepEqual(h.state.rawOptions.artifactIds, [id]);
  assert.equal(Object.hasOwn(h.state.rawOptions, "nativeVideo"), false);
});

test('preprocessed video details reach the text planner, writer and reviews without MP4 input', async () => {
  const h = harness({ raw: rawEvidence + '\nMediaEvidence: 视频画面显示写下项目的3个硬数字，并提前约15分钟沟通。transcript.status=unavailable' });
  await h.run();
  assert.equal(h.state.saved.generationTrace.length, 4);
  assert.equal(h.state.calls[0].schemaName, 'CommunityStoryBrief');
  for (const call of h.state.calls) {
    assert.ok(call.messages.every(m => typeof m.content === 'string'));
    assert.match(JSON.stringify(call.messages), /视频画面显示/);
    assert.doesNotMatch(JSON.stringify(call.messages), /video_url|file_url/);
  }
  assert.equal(h.state.usage.inputTokens, 40);
});

test('unprocessed native video cannot bypass MediaEvidence or reach an article model', async () => {
  const h = harness({ raw: [{ type: 'text', text: `artifactId: ${id}; MIME: video/mp4` }, { type: 'video_url', video_url: { url: 'https://fixture.invalid/raw.mp4' } }] });
  await assert.rejects(h.run(), /MediaEvidence/);
  assert.equal(h.state.calls.length, 0);
  assert.equal(h.state.saved, null);
});

test('read-only review cannot return replacement copy and must locate quoted issues in the draft', async () => {
  assert.equal(storyReviewSchema.safeParse({ articleReview: {}, body: '偷换文章', issues: [] }).success, false);
  const h = harness({ mutate: (stage, value) => stage === 'CommunityPostReview' ? { ...value, issues: [{ ...issue, quote: '不存在的原文' }] } : value });
  await assert.rejects(h.run(), /核验初稿/);
  assert.equal(h.state.saved, null);
});

test('revision cannot save if the final independent audit still finds problems', async () => {
  const h = harness({ mutate: (stage, value) => stage === 'CommunityPostReview' ? { ...value, issues: [issue] } : stage === 'EvidenceCheckedCommunityPost' ? { ...value, articleReview: { ...value.articleReview, boundedInterpretation: false, issues: ['问题尚未解决'] } } : value });
  await assert.rejects(h.run(), /最终保真/);
  assert.equal(h.state.saved, null);
  assert.equal(h.state.calls.length, 5);
});

test('format gates ask for targeted revision; unchanged or still-mechanical copy cannot publish', async () => {
  const h = harness({ mutate: (stage, value) => stage === 'CommunityPostDraft' ? { ...value, body: '好用的：' + value.body } : value });
  await assert.rejects(h.run(), /最终内容规范/);
  assert.equal(h.state.calls[3].schemaName, 'CommunityPostRevision');
  assert.equal(h.state.saved, null);
});

test('semantic false without an actionable issue fails before revision', async () => {
  const h = harness({ mutate: (stage, value) => stage === 'CommunityPostReview' ? { ...value, articleReview: { ...value.articleReview, boundedInterpretation: false } } : value });
  await assert.rejects(h.run(), /核验初稿/);
  assert.equal(h.state.calls.length, 3);
});

test('paragraph positions are determined from final text, independent of model numbering', async () => {
  const workspace = structuredClone(quick);
  workspace.artifacts[0].mimeType = 'image/png';
  const h = harness({ workspace, mutate: (stage, value) => stage === 'EvidenceCheckedCommunityPost' ? { ...value, screenshotRecommendations: [{ artifactId: id, reason: '支持准备清单', supportsClaim: '提前约15分钟', supportsParagraph: 99, order: 1 }] } : value });
  await h.run({ ...config, imageCount: 1 });
  assert.equal(h.state.saved.screenshotRecommendations[0].supportsParagraph, 1);
  assert.equal(h.state.saved.body, draft.body);
});
