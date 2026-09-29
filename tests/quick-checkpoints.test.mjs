import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import ts from 'typescript';

function load() {
  const stored = new Map();
  const repository = {
    async stage() {},
    async readStep(id, key) { return stored.get(`${id}:${key}`); },
    async saveStep(job, key, value) { stored.set(`${job.id}:${key}`, value); },
  };
  const code = ts.transpileModule(readFileSync(new URL('../lib/quick/checkpoints.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => {
    if (name === 'server-only') return {};
    if (name === 'node:async_hooks') return { AsyncLocalStorage };
    if (name.endsWith('quick-jobs.repository')) return { quickJobsRepository: repository };
    if (name.endsWith('signatures')) return { createInputSignature: value => createHash('sha256').update(JSON.stringify(value)).digest('hex') };
    throw new Error(name);
  }, exports);
  return { ...exports, stored };
}

test('resumes a completed draft without a second provider call after a process restart', async () => {
  const { checkpoint, quickExecution } = load();
  let calls = 0;
  const run = () => quickExecution.run({ job: { id: 'one', kind: 'publish' }, retryable: false, aiCalls: 0 }, () => checkpoint('draft', { evidence: 'immutable-v1' }, async () => ({ draft: ++calls })));
  assert.deepEqual(await run(), { draft: 1 });
  assert.deepEqual(await run(), { draft: 1 });
  assert.equal(calls, 1);
});
test('checkpoints are scoped by job, input version and route; failed results are never cached', async () => {
  const { checkpoint, quickExecution, stored } = load();
  let calls = 0;
  const run = (id, version, fail = false) => quickExecution.run({ job: { id, kind: 'publish' }, retryable: false, aiCalls: 0 }, () => checkpoint('draft', { version }, async () => { calls++; if (fail) throw new Error('network'); return calls; }));
  await assert.rejects(run('one', 1, true), /network/);
  assert.equal(stored.size, 0);
  await run('one', 1); await run('one', 2); await run('two', 1);
  assert.equal(calls, 4);
});
test('a publish invocation yields before the next uncached model stage, then resumes it', async () => {
  const { checkpoint, quickExecution, QuickYield } = load();
  let drafts = 0, edits = 0;
  const work = () => quickExecution.run({ job: { id: 'one', kind: 'publish' }, retryable: false, aiCalls: 0 }, async () => {
    const draft = await checkpoint('draft', {}, async () => ++drafts);
    return checkpoint('edit', { draft }, async () => ++edits);
  });
  await assert.rejects(work(), QuickYield);
  assert.equal(drafts, 1); assert.equal(edits, 0);
  assert.equal(await work(), 1);
  assert.equal(drafts, 1); assert.equal(edits, 1);
});
test('rotating a signed immutable Artifact URL does not regenerate a saved stage', async () => {
  const { checkpoint, quickExecution } = load();
  let calls = 0;
  const run = token => quickExecution.run({ job: { id: 'one', kind: 'publish' }, retryable: false, aiCalls: 0 }, () => checkpoint('draft', { url: `https://db.example/storage/v1/object/sign/bucket/artifact.png?token=${token}` }, async () => ++calls));
  await run('first'); await run('second'); assert.equal(calls, 1);
});
