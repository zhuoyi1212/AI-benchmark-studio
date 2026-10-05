import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { copyText } from '../lib/copy-text.ts';
import { queueArtifact, clipboardImageFiles } from '../lib/artifact-upload-queue.ts';
import createLoader from '../scripts/lib/load-typescript.cjs';

test('development allowlist contains only loopback and this host IPv4 addresses', () => {
  const load = createLoader(fileURLToPath(new URL('..', import.meta.url)), {
    'node:os': { networkInterfaces: () => ({
      lo0: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
      en0: [{ family: 'IPv4', address: '192.168.1.4', internal: false }, { family: 'IPv6', address: 'fe80::1', internal: false }],
      en1: [{ family: 'IPv4', address: '192.168.1.4', internal: false }],
      empty: undefined,
    }) },
  });
  const config = load('./next.config.ts').default;
  assert.deepEqual(config.allowedDevOrigins, ['127.0.0.1', '192.168.1.4']);
  assert.equal(config.experimental?.serverActions?.allowedOrigins, undefined, 'Do not relax Server Action origin checks');
});

test('upload queue and pasted images work without secure-context randomUUID', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const random = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues: random } });
  try {
    const file = new File(['fixture'], 'image.png', { type: 'image/png' });
    const first = queueArtifact(file); const second = queueArtifact(file);
    assert.notEqual(first.id, second.id);
    assert.match(first.id, /^[0-9a-f]{32}$/);
    assert.equal(clipboardImageFiles({ items: [], files: [file] }).length, 1);
  } finally { Object.defineProperty(globalThis, 'crypto', descriptor); }
});

async function withClipboard(clipboard, copySucceeded, verify) {
  const saved = new Map(['navigator', 'document', 'HTMLElement'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const events = [];
  class Element { focus() { events.push('focus'); } }
  const previousFocus = new Element();
  const textarea = Object.assign(new Element(), {
    value: '', style: {}, select() { events.push(`select:${this.value}`); }, remove() { events.push('remove'); },
  });
  const document = {
    activeElement: previousFocus, getSelection: () => null, createElement: () => textarea,
    body: { appendChild: () => events.push('append') },
    execCommand: command => { events.push(command); return copySucceeded; },
  };
  for (const [key, value] of Object.entries({ navigator: { clipboard }, document, HTMLElement: Element })) Object.defineProperty(globalThis, key, { configurable: true, value });
  try { await verify(events); }
  finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test('modern clipboard succeeds without a temporary element', async () => {
  let written;
  await withClipboard({ writeText: async text => { written = text; } }, true, async events => {
    await copyText('完整 Prompt\n第二行');
    assert.equal(written, '完整 Prompt\n第二行'); assert.deepEqual(events, []);
  });
});

test('HTTP or denied clipboard falls back to copy and restores focus', async () => {
  for (const clipboard of [undefined, { writeText: async () => { throw new Error('denied'); } }]) {
    await withClipboard(clipboard, true, async events => {
      await copyText('完整 Prompt\n第二行');
      assert.deepEqual(events, ['append', 'focus', 'select:完整 Prompt\n第二行', 'copy', 'remove', 'focus']);
    });
  }
});

test('failed fallback reports failure and removes the temporary textarea', async () => {
  await withClipboard(undefined, false, async events => {
    await assert.rejects(copyText('Prompt'), /rejected/);
    assert.deepEqual(events.slice(-2), ['remove', 'focus']);
  });
});
