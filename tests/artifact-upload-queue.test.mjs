import assert from 'node:assert/strict';
import test from 'node:test';
import { clipboardImageFiles, queueArtifact, uploadArtifactQueue } from '../lib/artifact-upload-queue.ts';

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

test('multiple files and pasted text upload sequentially with independent requests', async () => {
  const files = [new File(['a'], 'a.txt'), new File(['b'], 'b.txt'), new File(['raw'], 'pasted-raw-output.txt')];
  const metadata = new FormData();
  metadata.set('projectId', 'project'); metadata.set('testRunId', 'run'); metadata.set('retryCount', '0');
  metadata.set('rawText', 'do not resend this with every file'); metadata.set('artifact', files[0]);
  const received = []; let active = 0; const updates = [];
  const result = await uploadArtifactQueue(files.map(queueArtifact), metadata, async form => {
    assert.equal(++active, 1);
    assert.equal(form.get('rawText'), null);
    assert.equal(form.getAll('artifact').length, 1);
    assert.equal(form.get('testRunId'), 'run');
    received.push(form.get('artifact').name);
    await new Promise(resolve => setTimeout(resolve, 1));
    active--;
    return { ok: true, message: 'saved' };
  }, entry => updates.push(entry.status));
  assert.deepEqual(received, files.map(file => file.name));
  assert.ok(result.every(entry => entry.status === 'saved'));
  assert.deepEqual(updates, ['uploading', 'saved', 'uploading', 'saved', 'uploading', 'saved']);
});

test('partial failures retain files and explicit retry skips confirmed successes', async () => {
  const entries = ['a', 'b', 'c'].map(name => queueArtifact(new File([name], name)));
  const result = await uploadArtifactQueue(entries, new FormData(), async form => {
    const name = form.get('artifact').name;
    if (name === 'c') throw new Error('connection lost');
    return { ok: name === 'a', message: 'invalid file' };
  }, () => {});
  assert.deepEqual(result.map(entry => entry.status), ['saved', 'failed', 'failed']);
  assert.match(result[2].error, /未确认保存结果/);
  assert.equal(await result[1].file.text(), 'b');
  const retried = [];
  const saved = await uploadArtifactQueue(result, new FormData(), async form => {
    retried.push(form.get('artifact').name); return { ok: true, message: null };
  }, () => {});
  assert.deepEqual(retried, ['b', 'c']);
  assert.ok(saved.every(entry => entry.status === 'saved'));
});
