import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { readCurrentEvidenceStamp, requireSameEvidence, allowReadOnlyExperimentRequest } from '../scripts/lib/current-evidence.mjs';

function fixture() {
  const state = { protocol: { id: 'v6', version: 6, status: 'locked' },
    runs: [{ id: 'run6', status: 'ready_for_review' }],
    artifacts: [{ id: 'new-image', test_run_id: 'run6', sha256: 'new-hash', size_bytes: 20 }],
    finding: { id: 'finding6', status: 'completed', human_confirmed_at: 'confirmed', human_output: { findings: [{ evidenceArtifactIds: ['new-image'] }] } } };
  const load = name => ({
    '@/lib/repositories/protocols.repository': { protocolsRepository: { listByProject: async () => [state.protocol] } },
    '@/lib/repositories/test-execution.repository': { testExecutionRepository: { listRuns: async () => state.runs, listArtifacts: async () => state.artifacts } },
    '@/lib/repositories/findings.repository': { findingsRepository: { list: async () => [state.finding], listRevisions: async () => [] } },
  })[name];
  return { state, load };
}

test('local generation requires the current protocol, available files and confirmed findings; stale archives cannot match', async () => {
  const { state, load } = fixture();
  const stamp = await readCurrentEvidenceStamp(load, 'project');
  assert.doesNotThrow(() => requireSameEvidence(stamp, structuredClone(stamp)));
  for (const changed of [
    { ...stamp, protocolId: 'old-v1', protocolVersion: 1 },
    { ...stamp, artifacts: [{ id: 'old-deleted-image', sha256: 'old' }] },
    { ...stamp, artifacts: [{ ...stamp.artifacts[0], sha256: 'changed' }] },
    { ...stamp, findingsId: 'old-findings' },
  ]) assert.throws(() => requireSameEvidence(changed, stamp), /禁止使用旧快照/);
  state.finding.human_output.findings[0].evidenceArtifactIds = ['old-deleted-image'];
  await assert.rejects(readCurrentEvidenceStamp(load, 'project'), /引用已删除/);
  state.artifacts = [];
  await assert.rejects(readCurrentEvidenceStamp(load, 'project'), /尚未分析完成/);
});

test('experiment transport permits source reads and signed downloads but no database or Storage writes', () => {
  const origin = 'https://fixture.supabase.co';
  for (const [method, path] of [['GET', '/rest/v1/available_test_artifacts'], ['GET', '/storage/v1/object/authenticated/benchmark-artifacts/file'], ['POST', '/storage/v1/object/sign/benchmark-artifacts/file'], ['POST', '/rest/v1/rpc/pending_test_artifact_deletions']]) {
    assert.equal(allowReadOnlyExperimentRequest(origin + path, { method }, origin), 'source-read');
  }
  for (const [method, path] of [['DELETE', '/storage/v1/object/benchmark-artifacts'], ['POST', '/rest/v1/rpc/complete_publish_pack'], ['PATCH', '/rest/v1/test_runs'], ['POST', '/storage/v1/object/benchmark-artifacts/file']]) assert.throws(() => allowReadOnlyExperimentRequest(origin + path, { method }, origin), /禁止数据库和Storage写入/);
  assert.equal(allowReadOnlyExperimentRequest('https://api.z.ai/api/paas/v4/chat/completions', { method: 'POST' }, origin), 'provider');
  assert.throws(() => allowReadOnlyExperimentRequest('https://untrusted.invalid/upload', { method: 'POST' }, origin));
});

test('the mistaken frozen-source entry point refuses live calls before reading archived materials', () => {
  const result = spawnSync(process.execPath, ['scripts/generate-jimeng-style-pair.mjs', 'current', '--live'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /该冻结源已被当前测试替换并删除/);
});
