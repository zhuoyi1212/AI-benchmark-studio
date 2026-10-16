import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const directory = new URL('../docs/portfolio/', import.meta.url);
const assetDirectory = new URL('assets/badcases/', directory);
const manifest = JSON.parse(await readFile(new URL('archive-manifest.json', assetDirectory), 'utf8'));
const document = await readFile(new URL('生成失败BadCase复盘.md', directory), 'utf8');

test('failure archive preserves original screenshot bytes and distinguishes before/after provenance', async () => {
  const originals = {
    'jimeng-screenshot-schema-failure.png': '6702ea1513a6cb562becf823be4954148382e6b038e1ed31a7618f6c583b8853',
    'yuanbao-final-review-failure.png': 'c5d81d48efb2b9d0f0e42fb0acd9d8d06e20c51ffb9b4f4657135c0103fcce49',
  };
  const userImages = manifest.images.filter(image => image.source === 'user-original');
  assert.deepEqual(userImages.map(image => image.file).sort(), Object.keys(originals).sort());
  for (const image of manifest.images) {
    assert.equal(path.basename(image.file), image.file);
    const bytes = await readFile(new URL(image.file, assetDirectory));
    const digest = createHash('sha256').update(bytes).digest('hex');
    assert.equal(digest, image.sha256);
    if (image.source === 'user-original') {
      assert.equal(digest, originals[image.file]);
      assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    } else {
      assert.equal(image.source, 'browser-capture');
      assert.equal(bytes.subarray(0, 3).toString('hex'), 'ffd8ff');
    }
  }
});

test('badcase dossier links resolve and every archived screenshot is reachable', async () => {
  for (const [, target] of document.matchAll(/\]\(([^)]+)\)/g)) {
    const resolved = new URL(target, new URL('生成失败BadCase复盘.md', directory));
    assert.ok(resolved.href.startsWith(new URL('../', directory).href));
    assert.ok((await stat(resolved)).isFile(), `Missing evidence: ${target}`);
  }
  for (const image of manifest.images) assert.ok(document.includes(image.file));
  const overview = await readFile(new URL('作品集完整方案.md', directory), 'utf8');
  assert.ok(overview.includes('生成失败BadCase复盘.md'));
});

test('archived failures retain their identities and cannot include successful article records', () => {
  assert.equal(manifest.failedPacks.length, manifest.counts.publish_packs);
  assert.equal(manifest.failedJobs.length, manifest.counts.quick_jobs);
  const ids = [...manifest.failedPacks, ...manifest.failedJobs].map(row => row.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const record of [...manifest.failedPacks, ...manifest.failedJobs]) {
    assert.equal(record.status, 'failed');
    assert.ok(record.error);
    assert.ok(manifest.projects.some(project => project.id === record.projectId));
  }
  for (const record of manifest.failedJobs) {
    assert.ok(['research', 'protocol', 'evaluate', 'findings', 'discovery', 'publish', 'analysis', 'report'].includes(record.kind));
  }
  for (const project of manifest.projects) {
    assert.doesNotMatch(project.name, /^(\[E2E\]|AUTO DEMO|快速模式复用验证)/i);
    assert.equal(project.failedPacks, manifest.failedPacks.filter(row => row.projectId === project.id).length);
  }
  // Latest successful versions must never enter the removal catalog.
  for (const id of ['9182ba30-bc3d-449b-8d26-ac54adb66706', 'ac9f3921-f561-4c35-930a-abc88b6d2277', 'b1fdd8ff-8881-4a65-8e73-d315e3937229']) {
    assert.ok(!ids.includes(id));
  }
});

test('public archive excludes private inputs and keeps failures in future evaluation denominators', async () => {
  const serialized = JSON.stringify(manifest);
  assert.doesNotMatch(serialized, /storage\/v1\/object\/sign|sb_secret_|Bearer\s|eyJ[a-zA-Z0-9_-]{20,}/);
  for (const record of [...manifest.failedPacks, ...manifest.failedJobs]) {
    for (const key of ['payload', 'config', 'community_post', 'input', 'output', 'lease_token']) {
      assert.ok(!Object.hasOwn(record, key), `Private field in public archive: ${key}`);
    }
  }
  const ignore = await readFile(new URL('../.gitignore', import.meta.url), 'utf8');
  assert.ok(ignore.includes('outputs/badcase-archive/'));
  assert.equal(manifest.privateBackup.distribution, 'local-only; excluded from Git');
  assert.match(document, /失败和重试成本计入分母/);
  assert.match(document, /DeepSeek 文本初审/);
  assert.match(document, /不认定已找到供应商根因/);
});
