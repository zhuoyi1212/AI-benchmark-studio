import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import createLoader from '../scripts/lib/load-typescript.cjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const load = createLoader(root);
const { prepareAnalysisImage, maxAnalysisImageBytes, analysisImagePaths } = load('@/lib/media/analysis-image');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const project = '11111111-1111-4111-8111-111111111111';
const run = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const path = `projects/${project}/runs/${run}/${id}.png`;
const png = await sharp({ create: { width: 240, height: 160, channels: 4, background: '#12345680' } }).png().toBuffer();
// Deterministic high-detail pixels force actual lossy encoding rather than a mocked encoder.
const pixels = Buffer.alloc(1400 * 1300 * 3);
let seed = 12345;
for (let index = 0; index < pixels.length; index++) { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; pixels[index] = seed >>> 24; }
const noisy = await sharp(pixels, { raw: { width: 1400, height: 1300, channels: 3 } }).png().toBuffer();

test('small valid PNG remains byte-identical; source transparency and dimensions remain intact', async () => {
  const result = await prepareAnalysisImage(png, 'image/png');
  assert.deepEqual(result.bytes, png); assert.equal(result.manifest.encoding, 'original');
  assert.equal(result.manifest.sha256, hash(png)); assert.equal(result.manifest.sourceSha256, hash(png));
  assert.equal(result.manifest.width, 240); assert.equal(result.manifest.height, 160);
});

test('oversized PNG is losslessly reduced when possible, without changing pixels or raw bytes', async () => {
  const padded = Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024)]);
  const before = hash(padded); const result = await prepareAnalysisImage(padded, 'image/png');
  assert.ok(result.bytes.length < maxAnalysisImageBytes); assert.equal(result.manifest.encoding, 'lossless');
  assert.equal(result.manifest.sourceSha256, before); assert.equal(hash(padded), before);
  const originalPixels = await sharp(padded).raw().toBuffer();
  assert.deepEqual(await sharp(result.bytes).raw().toBuffer(), originalPixels);
});

test('real high-detail PNG uses high-quality JPEG under 4 MiB at the original resolution', async () => {
  assert.ok(noisy.length > 5 * 1024 * 1024);
  const result = await prepareAnalysisImage(noisy, 'image/png');
  assert.equal(result.manifest.encoding, 'jpeg'); assert.ok(result.manifest.quality >= 85);
  assert.ok(result.bytes.length <= maxAnalysisImageBytes); assert.equal(result.manifest.width, 1400); assert.equal(result.manifest.height, 1300);
  const meta = await sharp(result.bytes).metadata(); assert.equal(meta.format, 'jpeg');
  assert.equal(result.manifest.sourceSha256, hash(noisy));
});

test('WebP is converted to supported PNG with alpha and complete content retained', async () => {
  const webp = await sharp(png).webp({ lossless: true }).toBuffer();
  const result = await prepareAnalysisImage(webp, 'image/webp');
  assert.equal(result.manifest.mimeType, 'image/png');
  assert.deepEqual(await sharp(result.bytes).raw().toBuffer(), await sharp(webp).raw().toBuffer());
});

test('EXIF orientation is normalized and very long images resize proportionally without crop', async () => {
  const rotated = await sharp(png).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const result = await prepareAnalysisImage(rotated, 'image/jpeg');
  assert.equal(result.manifest.sourceWidth, 240); assert.equal(result.manifest.sourceHeight, 160);
  assert.equal(result.manifest.width, 160); assert.equal(result.manifest.height, 240);
  const long = await sharp({ create: { width: 7000, height: 140, channels: 3, background: 'white' } }).png().toBuffer();
  const resized = await prepareAnalysisImage(long, 'image/png');
  assert.equal(resized.manifest.width, 6000); assert.equal(resized.manifest.height, 120);
});

test('unreadable, mismatched, animated and excessive-input images fail before AI or persistence', async () => {
  await assert.rejects(prepareAnalysisImage(png.subarray(0, 32), 'image/png'), /无法解码/);
  await assert.rejects(prepareAnalysisImage(png, 'image/jpeg'), /实际格式/);
  await assert.rejects(prepareAnalysisImage(new Uint8Array(), 'image/png'), /为空/);
  await assert.rejects(prepareAnalysisImage(new Uint8Array(50 * 1024 * 1024 + 1), 'image/png'), /50 MB/);
  const second = await sharp(png).negate().png().toBuffer();
  const animated = await sharp([png, second], { join: { animated: true } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
  assert.equal((await sharp(animated, { animated: true }).metadata()).pages, 2);
  await assert.rejects(prepareAnalysisImage(animated, 'image/webp'), /静态/);
});

function fixture({ source = png, metadata = {}, missing = false, saved = new Map() } = {}) {
  const reads = []; const writes = [];
  const row = { id, kind: 'image', storage_path: path, size_bytes: source.length, sha256: hash(source), mime_type: 'image/png', metadata };
  const repository = {
    findArtifactById: async key => { assert.equal(key, id); return missing ? null : row; },
    readStorageObject: async key => { reads.push(key); if (key === path) return source; if (saved.has(key)) return saved.get(key); throw new Error('missing derivative'); },
    uploadStorageObject: async (key, bytes, mime) => { writes.push({ key, mime }); saved.set(key, Buffer.from(bytes)); },
  };
  const service = createLoader(root, { '@/lib/repositories/test-execution.repository': { testExecutionRepository: repository } })('@/lib/services/analysis-image.service');
  const input = { id, fileUrl: 'https://fixture.invalid/raw?secret-signature', fileType: row.mime_type, sizeBytes: row.size_bytes, sha256: row.sha256 };
  return { ...service, row, input, reads, writes, saved, repository };
}

test('upload creates a private traceable derivative; AI consumes those bytes and cannot see a source URL or path', async () => {
  const f = fixture({ source: noisy }); const before = hash(noisy);
  f.row.metadata.analysisImage = await f.storeAnalysisImage(path, noisy, 'image/png');
  assert.equal(f.writes.length, 1); assert.ok(analysisImagePaths(path).includes(f.writes[0].key));
  const image = await f.imageForAI(f.input);
  assert.equal(hash(Buffer.from(image.url.split(',')[1], 'base64')), f.row.metadata.analysisImage.sha256);
  assert.deepEqual(f.reads, [f.writes[0].key]); assert.equal(hash(noisy), before);
  assert.doesNotMatch(image.description, /projects\/|secret-signature|storagePath/);
  assert.match(image.description, /not product behaviour|not a new test output/);
});

test('duplicate derivative upload accepts only the identical verified object', async () => {
  const f = fixture({ source: noisy });
  const manifest = await f.storeAnalysisImage(path, noisy, 'image/png');
  f.repository.uploadStorageObject = async () => { throw new Error('already exists or response lost'); };
  assert.deepEqual(await f.storeAnalysisImage(path, noisy, 'image/png'), manifest);
  f.saved.set(manifest.storagePath, Buffer.from('another object'));
  await assert.rejects(f.storeAnalysisImage(path, noisy, 'image/png'), /already exists/);
});

test('legacy images adapt in memory without writing historical metadata or new Storage objects', async () => {
  const f = fixture({ source: noisy }); const before = structuredClone(f.row);
  const image = await f.imageForAI(f.input);
  assert.ok(Buffer.from(image.url.split(',')[1], 'base64').length <= maxAnalysisImageBytes);
  assert.deepEqual(f.row, before); assert.deepEqual(f.writes, []); assert.deepEqual(f.reads, [path]);
});

test('missing or corrupted derivative rebuilds only from the verified original', async () => {
  const f = fixture({ source: noisy });
  const manifest = await f.storeAnalysisImage(path, noisy, 'image/png');
  f.row.metadata.analysisImage = manifest;
  for (const bytes of [null, Buffer.from('corrupt')]) {
    if (bytes) f.saved.set(manifest.storagePath, bytes); else f.saved.delete(manifest.storagePath);
    const image = await f.imageForAI(f.input);
    assert.equal(hash(Buffer.from(image.url.split(',')[1], 'base64')), manifest.sha256);
  }
  f.row.sha256 = 'a'.repeat(64); f.input.sha256 = f.row.sha256;
  await assert.rejects(f.imageForAI(f.input), /完整性校验失败/);
});

test('a removed image is rejected and another artifact path in metadata is never fetched', async () => {
  const absent = fixture({ missing: true }); await assert.rejects(absent.imageForAI(absent.input), /已移除/); assert.deepEqual(absent.reads, []);
  const f = fixture(); f.row.metadata.analysisImage = { ...(await f.storeAnalysisImage(path, png, 'image/png')), storagePath: 'projects/another/private.png' };
  await f.imageForAI(f.input); assert.deepEqual(f.reads, [path]);
});

test('deletion batches original and both possible derivative formats, leaving unrelated objects untouched', async () => {
  const removed = [];
  const repository = createLoader(root, { '@/lib/supabase/server': { getSupabaseServerClient: () => ({ storage: { from: () => ({ remove: async paths => { removed.push(paths); return { error: null }; } }) } }) } })('@/lib/repositories/test-execution.repository').testExecutionRepository;
  await repository.removeStorageObject(path); await repository.removeStorageObject('unrelated.pdf');
  assert.deepEqual(removed, [[path, ...analysisImagePaths(path)], ['unrelated.pdf']]);
});

function uploadFixture({ failCommit = false, loseResponse = false } = {}) {
  const source = Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024)]);
  const objects = new Map([[path, source]]); let recorded = null; let commits = 0;
  const repository = {
    findRun: async () => ({ id: run, project_id: project, protocol_id: project, status: 'pending' }),
    findArtifactByStoragePath: async () => recorded,
    getStorageObjectInfo: async () => ({ size: source.length, contentType: 'image/png', etag: 'fixture' }),
    readStorageObject: async key => objects.get(key),
    uploadStorageObject: async (key, bytes) => objects.set(key, Buffer.from(bytes)),
    removeStorageObject: async key => { for (const value of [key, ...analysisImagePaths(key)]) objects.delete(value); },
    recordArtifact: async (_run, value) => {
      commits++;
      if (failCommit) throw new Error('database failed');
      recorded = { id: value.id, test_run_id: run, size_bytes: value.sizeBytes, sha256: value.sha256, metadata: value.metadata };
      assert.ok(objects.has(value.metadata.analysisImage.storagePath));
      if (loseResponse) throw new Error('response lost after commit');
      return value.id;
    },
  };
  const service = createLoader(root, {
    '@/lib/repositories/test-execution.repository': { testExecutionRepository: repository },
    '@/lib/repositories/protocols.repository': { protocolsRepository: { listByProject: async () => [{ id: project, status: 'locked' }] } },
  })('@/lib/services/test-execution.service');
  const input = { projectId: project, testRunId: run, artifactId: id, storagePath: path,
    file: { name: 'fixture.png', size: source.length, type: 'image/png', lastModified: null }, sha256: hash(source),
    metadata: { generationTimeSeconds: null, retryCount: 0, manuallyEdited: false, notes: null } };
  return { service, input, source, objects, repository, record: () => recorded, commits: () => commits };
}

test('direct upload confirms only after automatic compression and records original plus derivative provenance', async () => {
  const f = uploadFixture();
  assert.equal(await f.service.completeTestArtifactUpload(f.input), id);
  const saved = f.record(); const manifest = saved.metadata.analysisImage;
  assert.equal(saved.sha256, hash(f.source)); assert.equal(saved.size_bytes, f.source.length);
  assert.equal(manifest.sourceSha256, hash(f.source)); assert.ok(manifest.sizeBytes <= maxAnalysisImageBytes);
  assert.equal(hash(f.objects.get(path)), saved.sha256);
  assert.equal(hash(f.objects.get(manifest.storagePath)), manifest.sha256);
  assert.equal(await f.service.completeTestArtifactUpload(f.input), id); assert.equal(f.commits(), 1);
});

test('failed DB commit compensates both objects; a lost success response preserves both and is idempotent', async () => {
  const failed = uploadFixture({ failCommit: true });
  await assert.rejects(failed.service.completeTestArtifactUpload(failed.input));
  assert.equal(failed.objects.size, 0); assert.equal(failed.record(), null);
  const lost = uploadFixture({ loseResponse: true });
  assert.equal(await lost.service.completeTestArtifactUpload(lost.input), id);
  assert.equal(lost.objects.size, 2); assert.equal(lost.commits(), 1);
  assert.equal(await lost.service.completeTestArtifactUpload(lost.input), id); assert.equal(lost.commits(), 1);
});

test('tampered direct-upload bytes cannot be confirmed or analyzed', async () => {
  const f = uploadFixture(); f.input.sha256 = 'a'.repeat(64);
  await assert.rejects(f.service.completeTestArtifactUpload(f.input), /完整性校验失败/);
  assert.equal(f.objects.size, 0); assert.equal(f.commits(), 0);
});

test('mismatched confirmation cannot delete an already committed original or its derivative', async () => {
  const f = uploadFixture(); await f.service.completeTestArtifactUpload(f.input);
  f.input.sha256 = 'a'.repeat(64);
  await assert.rejects(f.service.completeTestArtifactUpload(f.input), /原文件已保留/);
  assert.equal(f.objects.size, 2); assert.equal(f.commits(), 1);
});

test('unknown DB confirmation preserves objects and reports a retry instead of treating uncertainty as absence', async () => {
  const f = uploadFixture({ loseResponse: true }); let reads = 0;
  f.repository.findArtifactByStoragePath = async () => { if (++reads === 2) throw new Error('database unavailable'); return null; };
  await assert.rejects(f.service.completeTestArtifactUpload(f.input), /暂未确认.*原文件已保留/);
  assert.equal(f.objects.size, 2); assert.equal(f.commits(), 1);
});
