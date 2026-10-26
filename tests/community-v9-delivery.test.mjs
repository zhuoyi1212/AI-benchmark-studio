import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { harness } from './helpers/publication.mjs';
const directory = new URL('../docs/project-articles/2026-10-17-v9自然表达对照/', import.meta.url);
const data = JSON.parse(await readFile(new URL('生成核验记录.json', directory), 'utf8'));
const previous = JSON.parse(await readFile(new URL('../docs/project-articles/2026-10-17三项目新稿/生成核验记录.json', import.meta.url), 'utf8'));
const { communityVoiceMetrics } = harness().load('@/lib/community-experience');

test('v9 local deliverables preserve both baselines, hashes, metrics and all attempted runs', async () => {
  assert.equal(data.projects.length, 3); assert.equal(data.databaseWrites, 0);
  assert.equal(data.naturalnessClaimed, false); assert.equal(data.readerBlindReview, 'pending');
  const comparison = await readFile(new URL('三项目v9新旧稿对照.md', directory), 'utf8');
  for (const project of data.projects) {
    const old = previous.projects.find(p => p.key === project.key);
    assert.equal(project.sourceHash, old.sourceHash);
    for (const [index, baseline] of [[0, old.baseline], [1, old.final]]) for (const field of ['title', 'body', 'tags', 'interactionQuestion']) assert.deepEqual(project.versions[index][field], baseline[field]);
    const final = project.versions[2];
    for (const v of project.versions) {
      assert.ok(comparison.includes(v.body));
      assert.deepEqual(v.voice, communityVoiceMetrics(v));
      assert.equal(v.groundedDetails.count, v.groundedDetails.quotes + v.groundedDetails.numbers);
      assert.equal(v.groundedDetails.count, v.groundedDetails.details.length);
    }
    const markdown = await readFile(new URL(project.file, directory), 'utf8');
    assert.equal(createHash('sha256').update(markdown).digest('hex'), project.sha256);
    assert.ok(markdown.includes(final.body));
    assert.equal(project.verification.databaseRequests, 0);
    assert.equal(project.verification.appWrites, 0);
    assert.equal(project.verification.frozenFieldsIdentical, true);
    assert.ok(project.attempts.some(a => a.attempt === project.selectedAttempt && a.status === 'completed'));
    assert.ok(project.generationTrace.every(t => ['moonshot', 'deepseek', 'zhipu'].includes(t.provider)));
    for (const [field, value] of Object.entries(project.finalPreservation)) assert.deepEqual(value, field === 'issues' ? [] : true);
    for (const [field, value] of Object.entries(project.finalArticleReview)) assert.deepEqual(value, field === 'issues' ? [] : true);
  }
  const metaso = data.projects.find(p => p.key === 'metaso');
  assert.match(metaso.versions[2].body, /我拿秘塔AI搜索跑了一次学术检索任务/);
  assert.equal(metaso.finalPreservation.experience, true);
  const jimeng = data.projects.find(p => p.key === 'jimeng');
  assert.equal(jimeng.currentRulesAudit.passed, true);
  assert.ok(data.projects.some(p => p.attempts.some(a => a.status === 'failed')));
  assert.ok(data.projects.some(p => p.attempts.some(a => a.status === 'excluded-after-source-review')));
  assert.match(comparison, /不代表自然度提升/);
  assert.match(comparison, /546af2f4-6e0b-47e7-be97-d517c1cae32f/);
  assert.match(comparison, /说明他不打算给/); assert.match(comparison, /项目热度还在的时候提/);
  assert.doesNotMatch(JSON.stringify(data), /SUPABASE_SERVICE_ROLE_KEY|MOONSHOT_API_KEY|Authorization|storage\/v1\/object\/sign|reasoning_content|data:image\//);
});
