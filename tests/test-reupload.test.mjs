import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import createLoader from '../scripts/lib/load-typescript.cjs';
import { deriveWorkflowState } from '../lib/workflow-navigation-state.ts';
import { selectQuickWorkspaceJobs } from '../lib/quick/workspace-jobs.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const projectId = '11111111-1111-4111-8111-111111111111';
const protocolId = '22222222-2222-4222-8222-222222222222';
const replacementId = '33333333-3333-4333-8333-333333333333';

test('restart service returns the atomic new round and preserves actionable failure messages', async () => {
  const load = createLoader(root, { '@/lib/repositories/test-execution.repository': { testExecutionRepository: { restart: async (project, protocol) => {
    assert.equal(project, projectId); assert.equal(protocol, protocolId); return replacementId;
  } } } });
  assert.equal(await load('@/lib/services/test-execution.service').restartTestExecution(projectId, protocolId), replacementId);
  await assert.rejects(load('@/lib/services/test-execution.service').restartTestExecution('invalid', protocolId), /无效/);
  for (const [code, message] of [['P2101', /版本已变化/], ['P2102', /后台仍在/], ['P2103', /没有需要移除/], ['unexpected', /原文件和分析已保留/]]) {
    const failing = createLoader(root);
    const { RepositoryError } = failing('@/lib/repositories/repository-error');
    const repository = failing('@/lib/repositories/test-execution.repository');
    repository.testExecutionRepository.restart = async () => { throw new RepositoryError('restart', { code, message: 'fixture' }); };
    await assert.rejects(failing('@/lib/services/test-execution.service').restartTestExecution(projectId, protocolId), message);
  }
});

for (const access of ['read-only', 'admin']) test(`delete action checks ${access} authorization and refreshes all stages only after success`, async () => {
  let calls = 0; const invalidations = [];
  const load = createLoader(root, {
    'next/headers': { headers: async () => new Headers({ 'x-ai-benchmark-access': access }) },
    'next/cache': { revalidatePath: (...args) => invalidations.push(args) },
    'next/navigation': { redirect: path => { throw new Error(`redirect:${path}`); } },
    '@/lib/services/test-execution.service': { removeTestArtifact: async (...ids) => { calls++; assert.deepEqual(ids, [projectId, protocolId, replacementId]); }, TestExecutionError: class extends Error {} },
  });
  const data = new FormData(); data.set('projectId', projectId); data.set('protocolId', protocolId); data.set('artifactId', replacementId);
  const run = () => load('@/app/projects/[projectId]/test/actions').removeTestArtifactAction({ ok: false, message: null }, data);
  if (access === 'admin') {
    assert.deepEqual(await run(), { ok: true, message: null });
    assert.equal(calls, 1);
    assert.ok(invalidations.some(([path, scope]) => path === `/projects/${projectId}` && scope === 'layout'));
  } else {
    assert.match((await run()).message, /管理员/); assert.equal(calls, 0); assert.deepEqual(invalidations, []);
  }
});

test('old completion cannot unlock a replacement upload round, including a later new draft', () => {
  const base = { projectId, evaluationMode: 'quick', productCount: 1,
    researchRuns: [{ id: 'research', version: 1, status: 'completed', comparability: null }],
    protocols: [{ id: replacementId, researchRunId: 'research', version: 2, status: 'locked', retestOfProtocolId: protocolId }, { id: protocolId, researchRunId: 'research', version: 1, status: 'locked' }],
    testCases: [{ id: 'case-old', protocolId }, { id: 'case-new', protocolId: replacementId }],
    testRuns: [{ id: 'old', protocolId, status: 'ready_for_review' }, { id: 'new', protocolId: replacementId, status: 'pending' }],
    artifactRunIds: ['old'], judgeRuns: [{ id: 'judge', protocolId, status: 'completed' }],
    reviewSessions: [{ id: 'review', protocolId, judgeRunId: 'judge', status: 'revealed' }],
    experienceFindings: [{ id: 'finding', protocolId, status: 'completed', humanConfirmedAt: '2026-10-25' }],
    resultAnalyses: [], reports: [], publishPacks: [{ id: 'pack', findingsId: 'finding', reportId: null, status: 'ready' }],
  };
  const state = deriveWorkflowState(base);
  assert.equal(state.stages.test.accessible, true);
  for (const name of ['test','review','results','publish']) assert.equal(state.stages[name].completed, false, name);
  assert.equal(state.stages.publish.accessible, false);
  const nextDraft = deriveWorkflowState({ ...base, protocols: [{ id: 'next', version: 3, status: 'draft' }, ...base.protocols] });
  assert.equal(nextDraft.stages.test.accessible, false);
  assert.equal(nextDraft.stages.publish.accessible, false);
});

test('old writing jobs do not block a new round with no current findings', () => {
  const old = { id: 'job', kind: 'publish', payload: { findingsId: 'old' }, scope: 'old', status: 'failed', created_at: '2026-10-24' };
  assert.deepEqual(selectQuickWorkspaceJobs([old], { protocolId: replacementId, protocolLocked: true, findingsId: null, reviewCompleted: false, findingsCompleted: false, publishReady: false }), { active: undefined, failed: undefined });
});

test('stale prepare and completion cannot add files or remove Storage from an old round', async () => {
  let touchedStorage = false;
  const load = createLoader(root, {
    '@/lib/repositories/test-execution.repository': { testExecutionRepository: {
      findRun: async () => ({ id: projectId, project_id: projectId, protocol_id: protocolId, status: 'uploaded' }),
      createSignedUpload: async () => { touchedStorage = true; },
      removeStorageObject: async () => { touchedStorage = true; },
    } },
    '@/lib/repositories/protocols.repository': { protocolsRepository: { listByProject: async () => [{ id: replacementId, status: 'locked' }] } },
  });
  const service = load('@/lib/services/test-execution.service');
  const input = { projectId, testRunId: projectId, file: { name: 'old.png', type: 'image/png', size: 32, lastModified: null } };
  await assert.rejects(service.prepareTestArtifactUpload(input), /测试版本已变化/);
  await assert.rejects(service.completeTestArtifactUpload({ ...input, artifactId: replacementId, sha256: 'a'.repeat(64), storagePath: 'old', metadata: { retryCount: 0, generationTimeSeconds: null, manuallyEdited: false, notes: null } }), /测试版本已变化/);
  assert.equal(touchedStorage, false);
});

test('replacement RPC keeps immutable history, locks exact task copies and guards active work', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261025131254_test_execution_reupload.sql', import.meta.url), 'utf8');
  assert.match(sql, /security invoker set search_path = ''/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /perform public.lock_protocol\(replacement\)/);
  assert.match(sql, /perform public.ensure_test_run_matrix/);
  assert.match(sql, /P2102/);
  assert.match(sql, /revoke all on function public.restart_test_execution\(uuid,uuid\) from public,anon,authenticated/);
  assert.doesNotMatch(sql, /delete from|disable trigger|drop table|update public\.(test_artifacts|judge_scores|human_review_events|experience_findings)/i);
  const page = await readFile(new URL('../app/projects/[projectId]/test/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /admin && <RemoveArtifactAction/);
  assert.doesNotMatch(page, /ReuploadAction/);
  const component = await readFile(new URL('../app/projects/[projectId]/test/remove-artifact-action.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(component, /Dialog|confirm\(/);
  assert.match(component, /aria-label=\{`删除/);
  assert.match(component, /disabled=\{pending\}/);
});
