import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const directory = new URL('../docs/project-articles/2026-10-26即梦风格卡对照/', import.meta.url);
const read = name => readFile(new URL(name, directory), 'utf8');
const hash = text => createHash('sha256').update(text).digest('hex');

test('the invalidated comparison retains audit copies but no longer displays deleted evidence as current results', async () => {
  const report = JSON.parse(await read('生成核验.json'));
  const comparison = await read('两版全文对照.md');
  const html = await read('两版并排对照.html');
  assert.equal(hash(comparison), report.comparisonSha256);
  assert.equal(hash(html), report.htmlSha256);
  assert.match(html, /这组对照已失效/);
  assert.match(comparison, /已撤回：来源过期/);
  assert.equal(report.invalidation.currentProtocolVersion, 6);
  assert.equal(report.runs.length, 2);
  for (const run of report.runs) {
    const markdown = await read(run.file);
    assert.equal(markdown, `# ${run.title}\n\n${run.body}\n`);
    assert.equal(hash(markdown), run.markdownSha256);
    assert.equal(hash(run.body), run.bodySha256);
    assert.equal(Array.from(run.body).length, run.bodyCharacters);
    assert.ok(comparison.includes(markdown));
    const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    for (const paragraph of run.body.split(/\n\s*\n/)) assert.equal(html.includes(`<p>${escape(paragraph)}</p>`), false);
    assert.equal(run.policyVersion, 'community-story.v13-de-ai-flavor');
    assert.equal(run.articleReview.issues.length, 0);
    assert.equal(run.stylePreservation.issues.length, 0);
  }
  assert.equal(report.manualCopyEdits, false);
  assert.equal(report.extraEditorialReminders, false);
  assert.equal(report.status, 'invalidated_stale_source');
});

test('paired delivery records identical original evidence and model controls, with failures and planning resumption disclosed', async () => {
  const report = JSON.parse(await read('生成核验.json'));
  const [current, candidate] = report.runs;
  assert.equal(report.sourceMaterialsIdentical, true);
  assert.equal(current.sourceHash, candidate.sourceHash);
  assert.equal(current.rawEvidenceHash, candidate.rawEvidenceHash);
  assert.equal(current.guidanceHash, hash(''));
  assert.notEqual(candidate.guidanceHash, current.guidanceHash);
  assert.equal(current.profileVersion, null);
  assert.equal(candidate.profileVersion, '0.1.0-candidate');
  for (const schemaName of ['CommunityStoryBrief', 'CommunityPostDraft', 'CommunityPostReview', 'CommunityPostRevision', 'EvidenceCheckedCommunityPost']) {
    const a = current.requestControls.find(item => item.schemaName === schemaName);
    const b = candidate.requestControls.find(item => item.schemaName === schemaName);
    if (a && b) for (const field of ['model', 'maxTokens', 'reasoningEffort', 'thinking', 'stream']) assert.deepEqual(a[field], b[field]);
  }
  assert.ok(report.failedAttempts.length > 0);
  assert.ok(report.failedAttempts.some(item => item.status === 'failed_before_draft'));
  assert.ok(current.resumedStages.every(item => item.stage === 'CommunityStoryBrief'));
  assert.ok(candidate.resumedStages.every(item => ['CommunityStoryBrief', 'CommunityPostDraft', 'CommunityPostReview'].includes(item.stage)));
  for (const field of ['databaseRequests', 'databaseWrites', 'storageWrites', 'appWrites', 'deploys']) assert.equal(report[field], 0);
  assert.match(await read('两版全文对照.md'), /不声称是留出材料/);
});
