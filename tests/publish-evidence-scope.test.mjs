import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import createLoader from '../scripts/lib/load-typescript.cjs';
const one = '11111111-1111-4111-8111-111111111111';
const two = '22222222-2222-4222-8222-222222222222';
function evidenceLoader({ video = false } = {}) {
  const workspace = {
    project: { id: one, name: '范围夹具', products: [{ id: one, name: '样本' }] },
    protocol: { id: one, version: 1, title: '测试', goal: '测试', testCases: [one, two].map(id => ({ id, title: id === one ? '所选任务' : '另一任务', prompt: id === one ? '所选输入' : '不该发送的输入', expectedOutputTypes: ['text'], observationFocus: [] })) },
    testRuns: [one, two].map(id => ({ id, productId: one, testCaseId: id, notes: id === one ? '所选备注' : '不该发送的备注', artifacts: [{ id, fileType: 'text/plain', fileName: `${id}.txt`, fileUrl: `https://fixture.invalid/${id}`, sizeBytes: 6, sha256: null }] })),
  };
  if (video) {
    workspace.protocol.testCases[0].expectedOutputTypes = ['video'];
    workspace.testRuns[0].artifacts[0].fileType = 'video/mp4';
    workspace.testRuns[0].artifacts.push({ ...workspace.testRuns[0].artifacts[0], id: two, fileType: 'image/png' });
  }
  return createLoader(fileURLToPath(new URL('..', import.meta.url)), {
    '@/lib/services/test-execution.service': { getTestExecutionWorkspace: async () => workspace },
    '@/lib/services/research.service': { getResearchWorkspace: async () => ({ completedResult: { products: [] } }) },
    '@/lib/ai/task-service': { aiTaskService: {} },
  });
}

test('selected raw evidence excludes other tasks and refuses missing source artifacts', async () => {
  const load = evidenceLoader();
  const fetched = [];
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async url => { fetched.push(url); return new Response('原话'); };
  try {
    const raw = await load('@/lib/services/findings.service').buildRawFindingsEvidenceContent(one, { testCaseIds: [one], artifactIds: [one] });
    assert.deepEqual(fetched, [`https://fixture.invalid/${one}`]);
    assert.match(JSON.stringify(raw), /所选备注/);
    assert.doesNotMatch(JSON.stringify(raw), /不该发送/);
    await assert.rejects(load('@/lib/services/findings.service').buildRawFindingsEvidenceContent(one, { testCaseIds: [one], artifactIds: [two] }), /缺少当前来源/);
    assert.equal(fetched.length, 1);
  } finally { globalThis.fetch = oldFetch; }
});

test('Publish sends native video and excludes auxiliary images without changing upstream transport', async () => {
  const service = evidenceLoader({ video: true })('@/lib/services/findings.service');
  const options = { testCaseIds: [one], artifactIds: [one, two] };
  const current = await service.buildRawFindingsEvidenceContent(one, { ...options, nativeVideo: true });
  assert.equal(current.filter(p => p.type === 'video_url').length, 1);
  assert.equal(current.some(p => p.type === 'file_url' || p.type === 'image_url'), false);
  const legacy = await service.buildRawFindingsEvidenceContent(one, options);
  assert.equal(legacy.filter(p => p.type === 'file_url').length, 1);
});
