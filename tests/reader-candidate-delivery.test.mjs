import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const folder = new URL('../docs/project-articles/2026-10-17三项目新稿/', import.meta.url);
const metadata = JSON.parse(await readFile(new URL('生成核验记录.json', folder), 'utf8'));

test('three local candidate deliveries retain exact baseline copies and final rendered text', async () => {
  const archive = JSON.parse(await readFile(new URL('../docs/project-articles/项目与文章汇编数据.json', import.meta.url), 'utf8'));
  assert.deepEqual(metadata.projects.map(p => p.key), ['jimeng', 'dongni', 'metaso']);
  assert.equal(metadata.status, 'local_candidates_not_saved_to_app');
  const comparison = await readFile(new URL('三项目新旧稿对照.md', folder), 'utf8');
  for (const project of metadata.projects) {
    const old = archive.projects.flatMap(p => p.articles).find(a => a.id === project.sourcePackId);
    assert.ok(old);
    assert.equal(project.sourceVersion, old.version);
    for (const field of ['title', 'body', 'tags', 'interactionQuestion']) assert.deepEqual(project.baseline[field], old[field]);
    const bytes = await readFile(new URL(project.fileName, folder));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), project.sha256);
    assert.ok(bytes.toString().includes(project.final.body));
    assert.ok(comparison.includes(project.final.body));
    assert.ok(comparison.includes(project.baseline.body));
  }
});

test('local candidate provenance separates original pipeline from supplemental review and protects private payloads', () => {
  assert.equal(metadata.databaseWrites, 0);
  assert.equal(metadata.allSourcesRechecked, true);
  for (const project of metadata.projects) {
    assert.equal(project.verification.finalSourceHash, project.sourceHash);
    assert.equal(project.verification.oldArticleUnchanged, true);
    assert.equal(project.verification.sourceUnchanged, true);
    assert.equal(project.verification.finalDeterministicChecksPassed, true);
    assert.equal(project.verification.databaseWrites, 0);
    assert.ok(project.pipelineTrace.some(t => t.stage === 'writing' && t.provider === 'moonshot' && t.model === 'kimi-k3'));
    assert.equal(project.supplementalTrace[0].provider, 'moonshot');
    assert.equal(project.supplementalTrace[1].provider, 'deepseek');
    assert.deepEqual(project.finalArticleReview.issues, []);
    assert.deepEqual(project.finalPreservation.issues, []);
    for (const key of ['facts', 'scope', 'stance', 'experience', 'advice', 'evidence']) assert.equal(project.finalPreservation[key], true);
    assert.doesNotMatch(project.final.body, /省好几个小时|我最在意|对我来说/);
  }
  assert.doesNotMatch(JSON.stringify(metadata), /storage\/v1\/object\/sign|sb_secret_|\"messages\"|\"providerMessage\"|\"authorization\"|base64,/i);
});
