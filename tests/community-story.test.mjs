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
  await assert.rejects(h.run(), /修订已发现的问题/);
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

test('artifact-backed first person is execution, while unsupported feelings, time and preferences are flagged', async () => {
  const { firstPersonExperienceIssues } = harness().load('@/lib/community-experience');
  const context = { executionFacts: [{ productId: id, testCaseId: id, artifactIds: [id] }] };
  const execution = { body: '我用 X 跑了这个任务。我把提示词贴进去。下载下来一看，图上有水印。' };
  assert.deepEqual(firstPersonExperienceIssues(execution, context), []);
  assert.ok(firstPersonExperienceIssues(execution, {}).length);
  for (const body of ['我当时挺意外。', '花了我十分钟。', '我会继续用。', '我觉得最实用。', '我手动修改了标题。', '我重试了3次。']) assert.ok(firstPersonExperienceIssues({ body }, context).length, body);
  assert.deepEqual(firstPersonExperienceIssues({ body: '我当时挺意外。' }, { ...context, authorPerspective: { focus: '我当时挺意外' } }), []);
  assert.deepEqual(firstPersonExperienceIssues({ body: '花了我十分钟。' }, { ...context, experienceRecords: ['花了我十分钟'] }), []);
  assert.deepEqual(firstPersonExperienceIssues({ body: '产品写道：“我当时挺意外。”' }, context), []);
  const h = harness({ mutate(stage, value) {
    if (stage === 'CommunityPostDraft') value.body = '我用沟通工具样本跑了这个任务。' + value.body;
    return value;
  } });
  await h.run(); assert.equal(h.state.calls.length, 4);
  for (const name of ['CommunityPostDraft', 'CommunityPostReview', 'EvidenceCheckedCommunityPost']) {
    const call = h.state.calls.find(c => c.schemaName === name);
    assert.match(call.messages[0].content, /人工执行|人工测试/);
    const input = JSON.parse(call.messages[1].content); assert.deepEqual((input.source ?? input).executionFacts[0].artifactIds, [id]);
  }
});

test('editorial signals trigger targeted revision but may remain without failing generation', async () => {
  const h = harness({ mutate(stage, value, input) {
    if (stage === 'CommunityPostDraft') return { ...value, body: '据此给一个使用建议。' + value.body, tags: ['沟通', '准备', '话术', '清单', '职场', 'AI'] };
    if (stage === 'CommunityPostRevision') return input.draft; // unchanged editorial-only copy is allowed
    return value;
  } });
  await h.run(); assert.equal(h.state.calls.length, 5);
  assert.ok(h.state.saved.naturalVoiceAudit.remainingIssues.some(i => i.includes('据此')));
  assert.equal(h.state.saved.naturalVoiceAudit.tagsTrimmed, true);
  assert.equal(h.state.saved.tags.length, 5);
  const input = JSON.parse(h.state.calls[3].messages[1].content);
  assert.ok(input.review.deterministicIssues.some(i => i.includes('标签数量')));
  assert.ok(input.review.editorialOnlyIssues.length);
});

test('lost concrete detail reaches deterministic repair and explicit deletion remains permitted', async () => {
  for (const explicit of [false, true]) {
    const quote = '提前约15分钟沟通';
    const h = harness({ mutate(stage, value) {
      if (stage === 'CommunityPostDraft') value.body += `产品原话：“${quote}”。`;
      if (stage === 'CommunityPostReview') value.issues = [{ field: 'body', quote, kind: 'language', reason: explicit ? '引用过长' : '修订建议', instruction: explicit ? '删除这段引用' : '改善衔接，保留具体原话' }];
      if (stage === 'CommunityPostRevision') value.body = '回答提供准备清单。';
      return value;
    } });
    if (explicit) {
      // Other numbers in the original still need preserving; only the located quote is exempt.
      await assert.rejects(h.run(), /修订已发现的问题/);
    } else {
      await assert.rejects(h.run(), /修订已发现的问题/);
      const check = h.state.calls[3].schema.safeParse({ title: draft.title, body: '回答提供准备清单。', interactionQuestion: '' });
      assert.match(check.error.message, /deterministicIssues.*具体细节丢失/);
    }
    assert.equal(h.state.saved, null);
  }
  const h = harness({ mutate(stage, value) {
    if (stage === 'CommunityPostDraft') value.body = '产品原话：“提前约15分钟沟通”。';
    if (stage === 'CommunityPostReview') value.issues = [{ field: 'body', quote: '提前约15分钟沟通', kind: 'language', reason: '引用过长', instruction: '删除这段引用' }];
    if (stage === 'CommunityPostRevision') value.body = '回答提供准备清单。';
    return value;
  } });
  await h.run(); assert.ok(h.state.saved);
});

test('human test notes support semantic experience review; uploaded answers cannot replace the notes', () => {
  const { manualTestNoteRecords, firstPersonExperienceIssues } = harness().load('@/lib/community-experience');
  const facts = [{ productId: id, testCaseId: id, artifactIds: [id] }];
  const label = notes => ({ type: 'text', text: `Product: 样本; productId: ${id}; TestCase: 测试; testCaseId: ${id}; artifactId: ${id}; MIME: text/plain; TestRun notes: ${notes}` });
  assert.deepEqual(manualTestNoteRecords([label('none'), label('花了我十分钟')], facts), []);
  const experienceRecords = manualTestNoteRecords([label('记录耗时10分钟')], facts);
  assert.deepEqual(firstPersonExperienceIssues({ body: '花了我十分钟。' }, { executionFacts: facts, experienceRecords }), []);
  assert.deepEqual(manualTestNoteRecords([label('花了我十分钟')], []), []);
});

test('remaining-project K3 delivery preserves article bytes, writing provenance and immutable source lineage', async () => {
  const { readFile } = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const root = new URL('../docs/project-articles/2026-10-18-K3补齐/', import.meta.url);
  const record = JSON.parse(await readFile(new URL('生成与App写入记录.json', root), 'utf8'));
  assert.match(record.scope, /latest.*preserve historical/);
  assert.deepEqual(record.articles.map(a => a.key).sort(), ['comparison', 'kimi', 'wancai', 'yuanbao']);
  for (const article of record.articles) {
    assert.notEqual(article.packId, article.sourcePackId);
    assert.equal(article.version, article.sourceVersion + 1);
    assert.equal(article.status, 'ready');
    assert.equal(article.model, 'kimi-k3');
    assert.ok(article.generationTrace.some(stage => stage.stage === 'writing' && stage.provider === 'moonshot' && stage.model === 'kimi-k3'));
    assert.ok(article.generationTrace.some(stage => stage.stage === 'fact_check'));
    for (const field of ['facts', 'scope', 'stance', 'experience', 'advice', 'evidence']) assert.equal(article.stylePreservation[field], true);
    assert.deepEqual(article.stylePreservation.issues, []);
    assert.equal(article.originalArtifactsUnchanged, true);
    assert.equal(article.pageVerification.fullBodyPresent, true);
    assert.equal(article.bodyHashEncoding, 'UTF-8 JSON.stringify(body)');
    assert.equal(createHash('sha256').update(JSON.stringify(article.body)).digest('hex'), article.bodyHash);
    const copy = await readFile(new URL(article.articleFile, root), 'utf8');
    assert.equal(createHash('sha256').update(copy).digest('hex'), article.articleFileHash);
    assert.ok(copy.startsWith(`# ${article.title}\n\n${article.body}\n`));
  }
});
