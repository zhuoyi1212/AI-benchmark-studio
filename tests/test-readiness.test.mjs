import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import ts from 'typescript';

function load({ project = { evaluation_mode: 'quick' }, protocols = [{ id: 'current', status: 'locked' }], runs = [{ id: 'a' }, { id: 'b' }], artifacts = [{ test_run_id: 'a' }, { test_run_id: 'b' }] } = {}) {
  const calls = [];
  class RepositoryError extends Error {}
  const dependencies = {
    'server-only': {}, 'node:crypto': { createHash, randomUUID }, zod: { z },
    '@/lib/repositories/repository-error': { RepositoryError },
    '@/lib/repositories/projects.repository': { projectsRepository: { findActiveById: async () => project } },
    '@/lib/repositories/protocols.repository': { protocolsRepository: { listByProject: async () => protocols } },
    '@/lib/repositories/test-execution.repository': { testExecutionRepository: {
      listRuns: async id => { calls.push(['runs', id]); return runs; },
      listArtifacts: async ids => { calls.push(['artifacts', ids]); return artifacts; },
    } },
    '@/lib/services/protocols.service': { getProtocolWorkspace: () => { throw new Error('Readiness must not load research or signed downloads'); } },
  };
  const code = ts.transpileModule(readFileSync(new URL('../lib/services/test-execution.service.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => { assert.ok(name in dependencies, name); return dependencies[name]; }, exports);
  return { ...exports, calls };
}

test('evaluation readiness reads persisted evidence for the latest locked protocol without rebuilding display data', async () => {
  const service = load();
  assert.deepEqual(await service.getTestExecutionReadiness('project'), { evaluationMode: 'quick', protocolId: 'current', complete: true });
  assert.deepEqual(service.calls, [['runs', 'current'], ['artifacts', ['a', 'b']]]);
});

test('an archived project or a newer draft cannot enqueue an old locked protocol', async () => {
  for (const input of [{ project: null }, { protocols: [{ id: 'new', status: 'draft' }, { id: 'old', status: 'locked' }] }, { protocols: [] }]) {
    const service = load(input);
    assert.equal(await service.getTestExecutionReadiness('project'), null);
    assert.deepEqual(service.calls, []);
  }
});

test('empty tests, missing evidence and another run\'s evidence do not count as ready', async () => {
  for (const input of [{ runs: [] }, { artifacts: [] }, { artifacts: [{ test_run_id: 'a' }, { test_run_id: 'other' }] }]) {
    assert.equal((await load(input).getTestExecutionReadiness('project')).complete, false);
  }
});

function loadEnqueue(readiness) {
  const calls = [];
  const dependencies = {
    'server-only': {}, zod: { z },
    '@/lib/repositories/quick-jobs.repository': { quickJobsRepository: { list: async () => [], enqueue: async (...args) => calls.push(args) } },
    '@/lib/repositories/protocols.repository': {},
    '@/lib/services/human-review.service': {},
    '@/lib/services/projects.service': {},
    '@/lib/services/research.service': {},
    '@/lib/services/test-execution.service': { getTestExecutionReadiness: async () => readiness },
    '@/lib/services/findings.service': {}, '@/lib/signatures': {}, '@/lib/publish-config': {}, '@/lib/ai/schemas/publish.schemas': {},
  };
  const code = ts.transpileModule(readFileSync(new URL('../lib/services/quick-workflow.service.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => { assert.ok(name in dependencies, name); return dependencies[name]; }, exports);
  return { ...exports, calls };
}

test('upload completion resolves the current protocol once and queues only complete quick projects', async () => {
  const complete = { evaluationMode: 'quick', protocolId: 'current', complete: true };
  const service = loadEnqueue(complete);
  assert.equal(await service.enqueueQuickEvaluation('project'), true);
  assert.deepEqual(service.calls, [['project', { kind: 'evaluate', scope: 'current' }]]);
  const incomplete = loadEnqueue({ ...complete, complete: false });
  assert.equal(await incomplete.enqueueQuickEvaluation('project', 'current'), false);
  assert.deepEqual(incomplete.calls, []);
  for (const state of [null, { ...complete, evaluationMode: 'professional' }, { ...complete, protocolId: 'new' }]) {
    const blocked = loadEnqueue(state);
    await assert.rejects(blocked.enqueueQuickEvaluation('project', 'current'), /当前测试方案已变化/);
    assert.deepEqual(blocked.calls, []);
  }
});
