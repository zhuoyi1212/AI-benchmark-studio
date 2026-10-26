import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function readCurrentEvidenceStamp(load, projectId) {
  const protocol = (await load('@/lib/repositories/protocols.repository').protocolsRepository.listByProject(projectId))[0];
  assert.ok(protocol?.status === 'locked', '当前测试计划不可用');
  const repository = load('@/lib/repositories/test-execution.repository').testExecutionRepository;
  const runs = await repository.listRuns(protocol.id);
  const artifacts = await repository.listArtifacts(runs.map(run => run.id));
  assert.ok(runs.length && runs.every(run => run.status === 'ready_for_review' && artifacts.some(artifact => artifact.test_run_id === run.id)), '当前文件尚未分析完成');
  const findingsRepo = load('@/lib/repositories/findings.repository').findingsRepository;
  const finding = (await findingsRepo.list(projectId, protocol.id))[0];
  assert.ok(finding?.status === 'completed' && finding.human_confirmed_at, '当前测试尚无已确认发现');
  const revisions = await findingsRepo.listRevisions(finding.id);
  const revision = revisions.find(row => row.kind === 'editorial');
  assert.ok(artifacts.every(artifact => artifact.sha256), '当前文件缺少完整性校验值');
  const output = revision?.output ?? finding.human_output ?? finding.output;
  const ids = new Set(artifacts.map(row => row.id));
  assert.ok(output?.findings?.every(row => row.evidenceArtifactIds.every(id => ids.has(id))), '确认发现引用已删除或不属于当前测试的证据');
  return {
    projectId, protocolId: protocol.id, protocolVersion: protocol.version,
    runsHash: digest(runs.map(({ id, test_case_id, product_id, status, generation_time_seconds, retry_count, manually_edited, notes }) => ({ id, test_case_id, product_id, status, generation_time_seconds, retry_count, manually_edited, notes }))),
    artifacts: artifacts.map(({ id, sha256, test_run_id, size_bytes }) => ({ id, sha256, testRunId: test_run_id, sizeBytes: size_bytes })).sort((a, b) => a.id.localeCompare(b.id)),
    findingsId: finding.id, findingsRevisionId: revision?.id ?? null,
    confirmedAt: finding.human_confirmed_at, findingsHash: digest(output),
  };
}

export function requireSameEvidence(expected, current) {
  if (digest(expected) !== digest(current)) throw new Error('当前测试版本、附件或确认发现已变化；停止本地生成，禁止使用旧快照。');
}

export function allowReadOnlyExperimentRequest(input, init, supabaseOrigin) {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  assert.equal(url.protocol, 'https:');
  if (url.origin === supabaseOrigin) {
    const read = method === 'GET' && (url.pathname.startsWith('/rest/v1/') || url.pathname.startsWith('/storage/v1/object/'));
    const sign = method === 'POST' && url.pathname.startsWith('/storage/v1/object/sign/');
    const pending = method === 'POST' && url.pathname === '/rest/v1/rpc/pending_test_artifact_deletions';
    assert.ok(read || sign || pending, '本地实验禁止数据库和Storage写入');
    return 'source-read';
  }
  const endpoints = new Set(['https://api.moonshot.cn/v1/chat/completions', 'https://api.deepseek.com/chat/completions', 'https://api.z.ai/api/paas/v4/chat/completions']);
  assert.ok(method === 'POST' && endpoints.has(url.href), '仅允许当前AI Provider生成端点');
  return 'provider';
}
