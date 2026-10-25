import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import ts from 'typescript';
import { z } from 'zod';

function load(job, evaluation, regeneration, options = {}) {
  const finished = [];
  const recoveryWrites = [];
  const quickExecution = new AsyncLocalStorage();
  class QuickYield extends Error {}
  const noop = async () => {};
  const query = { eq() { return this; }, in() { return this; }, gte: async () => ({ error: null }) };
  const deps = {
    'server-only': {}, zod: { z },
    '@/lib/repositories/quick-jobs.repository': { quickJobsRepository: { list: async () => options.jobs ?? [job], claim: async () => job, heartbeat: noop, finish: async (...args) => finished.push(args) } },
    '@/lib/repositories/protocols.repository': { protocolsRepository: { listByProject: async () => [{ id: options.currentProtocolId ?? job.scope, status: 'locked' }] } },
    '@/lib/supabase/server': { getSupabaseServerClient: () => ({ from: table => ({ update: value => { recoveryWrites.push({ table, value }); return query; } }) }) },
    '@/lib/services/projects.service': { setQuickPreparationStatus: noop },
    '@/lib/services/research.service': { getResearchWorkspace: async () => { quickExecution.getStore().retryable = true; throw new Error('Temporary provider failure'); } },
    '@/lib/services/protocols.service': {},
    '@/lib/services/quick-evaluation.service': { advanceQuickEvaluation: evaluation },
    '@/lib/services/findings.service': { getExperienceFindingsWorkspace: async () => ({ latest: { id: options.currentFindingsId ?? job.payload.findingsId, humanConfirmedAt: 'confirmed' } }) },
    '@/lib/services/publish.service': { getPublishWorkspace: async () => ({ pack: options.pack ?? { id: job.payload.packId, ideas: [{ id: 'idea', recommended: true }] } }), generateCommunityPost: async () => { throw new QuickYield(); }, regeneratePreparedCommunityPost: regeneration },
    '@/lib/services/result-analysis.service': {}, '@/lib/services/report.service': {},
    '@/lib/ai/schemas/publish.schemas': { publishConfigSchema: z.object({}) },
    './checkpoints': { quickExecution, QuickYield },
  };
  const code = ts.transpileModule(readFileSync(new URL('../lib/quick/worker.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => { assert.ok(name in deps, name); return deps[name]; }, exports);
  return { ...exports, finished, recoveryWrites };
}
const base = { id: 'job', project_id: 'project', scope: 'protocol', created_at: '2026-09-30', attempts: 1 };

test('anomalous blind scores stop for human review; normal scores enqueue findings atomically', async () => {
  for (const next of ['review', 'findings']) {
    const worker = load({ ...base, kind: 'evaluate', payload: {} }, async () => ({ next, reviewSessionId: 'review' }));
    await worker.runQuickWorker('project', 1);
    assert.equal(worker.finished[0][1], 'completed');
    assert.deepEqual(worker.finished[0][4], next === 'findings' ? { kind: 'findings', scope: 'protocol' } : undefined);
  }
});
test('explicit article regeneration resumes its fixed pack without recovery writes or extra analysis jobs', async () => {
  const packId = '11111111-1111-4111-8111-111111111111';
  const calls = [];
  const worker = load({ ...base, kind: 'publish', payload: { mode: 'regenerate', packId }, result: null }, undefined,
    async (...args) => { calls.push(args); return packId; });
  await worker.runQuickWorker('project', 1);
  assert.deepEqual(calls, [['project', packId]]);
  assert.equal(worker.finished[0][1], 'completed');
  assert.deepEqual(worker.finished[0][2], { packId });
  assert.equal(worker.finished[0][4], undefined);
});

test('failed regeneration exposes retry instead of automatically reusing a terminal pack', async () => {
  const worker = load({ ...base, kind: 'publish', payload: { mode: 'regenerate', packId: '11111111-1111-4111-8111-111111111111' }, result: null }, undefined,
    async () => { throw new Error('Regeneration failed'); });
  await worker.runQuickWorker('project', 1);
  assert.equal(worker.finished[0][1], 'failed');
  assert.equal(worker.finished[0][3], 'Regeneration failed');
});
test('retryable errors requeue finitely, then expose a failed stage', async () => {
  for (const attempts of [1, 3]) {
    const worker = load({ ...base, kind: 'research', attempts });
    await worker.runQuickWorker('project', 1);
    assert.equal(worker.finished[0][1], attempts < 3 ? 'queued' : 'failed');
    assert.equal(worker.finished[0][3], 'Temporary provider failure');
  }
});
test('saved writing stages yield without marking the business run failed', async () => {
  const worker = load({ ...base, kind: 'publish', payload: { findingsId: '11111111-1111-4111-8111-111111111111', config: {} }, result: { continuation: true } });
  await worker.runQuickWorker('project', 1);
  assert.equal(worker.finished[0][1], 'queued');
  assert.deepEqual(worker.finished[0][2], { continuation: true });
  assert.equal(worker.finished[0][3], undefined);
});

test('retrying an old publish job cannot recover or generate a newer revision', async () => {
  const old = { ...base, kind: 'publish', payload: { packId: '11111111-1111-4111-8111-111111111111' }, result: null };
  const newer = { ...old, id: 'new', created_at: '2026-10-16', payload: { mode: 'regenerate' } };
  const worker = load(old, undefined, undefined, { jobs: [old, newer] });
  await worker.runQuickWorker('project', 1);
  assert.equal(worker.finished[0][1], 'failed');
  assert.match(worker.finished[0][3], /更新的文章任务/);
  assert.deepEqual(worker.recoveryWrites, []);
});

test('even without a newer queue row, a fixed pack mismatch stops before any recovery write', async () => {
  const worker = load({ ...base, kind: 'publish', payload: { packId: '11111111-1111-4111-8111-111111111111' }, result: null }, undefined, undefined,
    { pack: { id: '22222222-2222-4222-8222-222222222222', status: 'generating' } });
  await worker.runQuickWorker('project', 1);
  assert.equal(worker.finished[0][1], 'failed');
  assert.match(worker.finished[0][3], /文章版本已变化/);
  assert.deepEqual(worker.recoveryWrites, []);
});

test('jobs for replacement-upload history stop before recovery can mutate any newer run', async () => {
  for (const kind of ['evaluate', 'findings', 'discovery', 'publish', 'analysis', 'report']) {
    const job = { ...base, kind, payload: { findingsId: '11111111-1111-4111-8111-111111111111', config: {} } };
    const worker = load(job, undefined, undefined, { currentProtocolId: 'new-round', currentFindingsId: 'new-findings' });
    await worker.runQuickWorker('project', 1);
    assert.equal(worker.finished[0][1], 'failed', kind);
    assert.deepEqual(worker.recoveryWrites, [], kind);
  }
});
