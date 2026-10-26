import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../docs/project-articles/2026-10-26即梦新图两版对照/', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');

test('the replacement pair uses the new single image and preserves the actual model copies', async () => {
  const report = JSON.parse(await read('生成核验.json'));
  const html = await read('并排对照.html');
  const markdown = await read('两版全文.md');
  assert.equal(report.sourceStamp.protocolVersion, 6);
  assert.equal(report.sourceStamp.artifacts.length, 1);
  assert.equal(report.sourceStamp.artifacts[0].id, '761d2673-1097-4052-8d8c-cec8869953be');
  assert.equal(report.sourceStamp.artifacts[0].sha256, '0a5241022867ee80f1c1a71ade12919c6f3a430df836b396616664623f93e938');
  assert.equal(hash(html), report.htmlSha256);
  assert.equal(hash(markdown), report.comparisonSha256);
  assert.equal(report.sourceMaterialsIdentical, true);
  assert.equal(report.manualCopyEdits, false);
  for (const run of report.runs) {
    const file = await read(run.file);
    assert.equal(file, `# ${run.title}\n\n${run.body}\n`);
    assert.equal(hash(file), run.markdownSha256);
    assert.equal(hash(run.body), run.bodySha256);
    assert.ok(markdown.includes(file));
  }
  assert.equal(report.runs.length, 2);
  for (const schema of ['CommunityStoryBrief', 'CommunityPostDraft', 'CommunityPostReview', 'EvidenceCheckedCommunityPost']) {
    const a = report.runs[0].requests.find(request => request.schemaName === schema);
    const b = report.runs[1].requests.find(request => request.schemaName === schema);
    assert.ok(a && b);
    for (const field of ['model', 'maxTokens', 'reasoning', 'thinking']) assert.deepEqual(a[field], b[field]);
  }
  for (const field of ['databaseWrites', 'storageWrites', 'appWrites', 'deploys']) assert.equal(report[field], 0);
});

test('human-found errors stay distinct from model approvals and cannot be presented as publication-ready', async () => {
  const report = JSON.parse(await read('生成核验.json'));
  const human = JSON.parse(await read('人工核查.json'));
  const html = await read('并排对照.html');
  assert.equal(human.sourceArtifactId, report.sourceStamp.artifacts[0].id);
  assert.equal(human.status, 'requires_correction');
  for (const run of report.runs) {
    assert.equal(run.humanReview.acceptedForPublishing, false);
    assert.ok(html.includes(run.humanReview.label));
    assert.ok(run.humanReview.issues.length > 0);
    assert.ok(run.humanReview.issues.every(issue => run.body.includes(issue.quote)));
    assert.deepEqual(run.humanReview, human.variants[run.variant]);
    // Retain the actual reviewer response; do not forge its booleans to match the human check.
    assert.deepEqual(run.articleReview.issues, []);
  }
});
