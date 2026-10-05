import assert from 'node:assert/strict';
import test from 'node:test';
import { clipboardImageFiles, queueArtifact, uploadArtifactQueue } from '../lib/artifact-upload-queue.ts';
import { uploadArtifactDirectly } from '../lib/direct-artifact-upload.ts';

test('clipboard images keep their original bytes and receive distinct names', async () => {
  const bytes = new Uint8Array([137, 80, 78, 71]);
  const image = new File([bytes], 'image.png', { type: 'image/png' });
  const data = { items: [
    { kind: 'string', type: 'text/plain', getAsFile: () => null },
    { kind: 'file', type: 'image/png', getAsFile: () => image },
    { kind: 'file', type: 'image/png', getAsFile: () => null },
  ], files: [image] };
  const [first] = clipboardImageFiles(data);
  const [second] = clipboardImageFiles(data);
  assert.equal(clipboardImageFiles(data).length, 1, 'items and files must not double-add the same image');
  assert.notEqual(first.name, second.name);
  assert.equal(first.type, 'image/png');
  assert.deepEqual(new Uint8Array(await first.arrayBuffer()), bytes);
  assert.equal(clipboardImageFiles({ items: [], files: [image] }).length, 1);
  assert.deepEqual(clipboardImageFiles({ items: [], files: [new File(['text'], 'a.txt', { type: 'text/plain' })] }), []);
});

test('multiple files and pasted text upload sequentially with progress updates', async () => {
  const files = [new File(['a'], 'a.txt'), new File(['b'], 'b.txt'), new File(['raw'], 'pasted-raw-output.txt')];
  const received = []; let active = 0; const updates = [];
  const result = await uploadArtifactQueue(files.map(queueArtifact), async (entry, _batchComplete, onProgress) => {
    assert.equal(++active, 1);
    received.push(entry.file.name);
    onProgress(42);
    await new Promise(resolve => setTimeout(resolve, 1));
    active--;
    return { ok: true, message: 'saved' };
  }, entry => updates.push([entry.status, entry.progress]));
  assert.deepEqual(received, files.map(file => file.name));
  assert.ok(result.every(entry => entry.status === 'saved'));
  assert.deepEqual(updates, [
    ['uploading', 0], ['uploading', 42], ['saved', 100],
    ['uploading', 0], ['uploading', 42], ['saved', 100],
    ['uploading', 0], ['uploading', 42], ['saved', 100],
  ]);
});

test('partial failures retain files and explicit retry skips confirmed successes', async () => {
  const entries = ['a', 'b', 'c'].map(name => queueArtifact(new File([name], name)));
  const result = await uploadArtifactQueue(entries, async entry => {
    const name = entry.file.name;
    if (name === 'c') throw new Error('connection lost');
    return { ok: name === 'a', message: 'invalid file' };
  }, () => {});
  assert.deepEqual(result.map(entry => entry.status), ['saved', 'failed', 'failed']);
  assert.match(result[2].error, /重新上传这个文件/);
  assert.equal(await result[1].file.text(), 'b');
  const retried = [];
  const saved = await uploadArtifactQueue(result, async entry => {
    retried.push(entry.file.name); return { ok: true, message: null };
  }, () => {});
  assert.deepEqual(retried, ['b', 'c']);
  assert.ok(saved.every(entry => entry.status === 'saved'));
});

test('quick evaluation is requested only for the last upload after all prior entries succeeded', async () => {
  const entries = ['a', 'b', 'c'].map(name => queueArtifact(new File([name], name)));
  const flags = [];
  const partial = await uploadArtifactQueue(entries, async (entry, quickBatchComplete) => {
    flags.push(quickBatchComplete);
    return { ok: entry.file.name !== 'b', message: null };
  }, () => {});
  assert.deepEqual(flags, [false, false, false]);
  const retry = [];
  await uploadArtifactQueue(partial, async (entry, quickBatchComplete) => {
    retry.push([entry.file.name, quickBatchComplete]);
    return { ok: true, message: null };
  }, () => {});
  assert.deepEqual(retry, [['b', true]]);
});

test('signed direct upload reports progress and applies the server-normalized MIME type', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'XMLHttpRequest');
  const requests = [];
  class Request {
    upload = {};
    status = 0;
    responseText = '';
    headers = {};
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(name, value) { this.headers[name] = value; }
    send(body) {
      this.body = body;
      requests.push(this);
      this.upload.onprogress({ lengthComputable: true, loaded: 3, total: 4 });
      this.status = 200;
      this.onload();
    }
  }
  Object.defineProperty(globalThis, 'XMLHttpRequest', { configurable: true, value: Request });
  try {
    const progress = [];
    await uploadArtifactDirectly(
      new File(['video'], 'clip.mp4', { type: '' }),
      { artifactId: 'artifact', storagePath: 'path', signedUrl: 'https://storage.test/signed', mimeType: 'video/mp4' },
      value => progress.push(value),
    );
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, 'PUT');
    assert.equal(requests[0].url, 'https://storage.test/signed');
    assert.equal(requests[0].headers['x-upsert'], 'false');
    assert.equal(requests[0].body.get('cacheControl'), '3600');
    assert.equal(requests[0].body.get('').type, 'video/mp4');
    assert.deepEqual(progress, [75, 100]);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'XMLHttpRequest', descriptor);
    else delete globalThis.XMLHttpRequest;
  }
});
