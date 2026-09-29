import { z } from 'zod';
import { createProject, getProjectSummary, softDeleteProject } from '@/lib/services/projects.service';
import { enqueueQuickPreparation, enqueueQuickEvaluation, enqueueQuickWriting } from '@/lib/services/quick-workflow.service';
import { getProtocolWorkspace, lockProtocol } from '@/lib/services/protocols.service';
import { getTestExecutionWorkspace, uploadTestArtifact } from '@/lib/services/test-execution.service';
import { getExperienceFindingsWorkspace, confirmExperienceFindings } from '@/lib/services/findings.service';
import { getPublishWorkspace } from '@/lib/services/publish.service';
import { getHumanReviewWorkspace } from '@/lib/services/human-review.service';
import { quickJobsRepository } from '@/lib/repositories/quick-jobs.repository';

export const runtime = 'nodejs';
export const maxDuration = 300;
export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production' || process.env.E2E_TEST_MODE !== '1' || !process.env.E2E_TEST_TOKEN || request.headers.get('x-e2e-token') !== process.env.E2E_TEST_TOKEN) return new Response(null, { status: 404 });
  const input = z.object({ operation: z.enum(['create','status','adopt','upload','confirm','cleanup','retry']), runId: z.string().regex(/^[a-z0-9-]{8,80}$/), projectId: z.string().uuid().optional() }).parse(await request.json());
  if (input.operation === 'create') {
    const projectId = await createProject({ name: `[E2E] Backend Quick ${input.runId}`, intent: '验证后台自动推进，不通过浏览器触发下一步。', products: [{ name: `E2E Experience Product ${input.runId}`, officialUrl: `https://${input.runId}.single-e2e.example.com` }], evaluationMode: 'quick' });
    await enqueueQuickPreparation(projectId);
    await enqueueQuickPreparation(projectId); // duplicate delivery must deduplicate
    return Response.json({ projectId });
  }
  const projectId = input.projectId!;
  const project = await getProjectSummary(projectId);
  if (!project?.name.startsWith(`[E2E] Backend Quick ${input.runId}`)) return new Response(null, { status: 404 });
  if (input.operation === 'cleanup') return Response.json({ archived: await softDeleteProject(projectId) });
  if (input.operation === 'retry') {
    const failed = (await quickJobsRepository.list(projectId)).find(job => job.status === 'failed');
    if (!failed) throw new Error('No failed fixture job');
    await quickJobsRepository.retry(projectId, failed.id);
    return Response.json({ retried: failed.id });
  }
  const protocol = (await getProtocolWorkspace(projectId))?.protocol;
  if (input.operation === 'adopt' && protocol) await lockProtocol(projectId, protocol.id);
  if (input.operation === 'upload' && protocol) {
    const test = await getTestExecutionWorkspace(projectId);
    if (!test) throw new Error('Missing test workspace');
    for (const run of test.testRuns) await uploadTestArtifact({ projectId, testRunId: run.id, file: new File([`原始测试回答：本次任务输出有可追溯的结果。\nTest run ${run.id} completed the task with traceable output.`], 'raw.txt', { type: 'text/plain' }), metadata: { generationTimeSeconds: 7, retryCount: 0, manuallyEdited: false, notes: 'E2E synthetic fixture; not real product claims' } });
    await enqueueQuickEvaluation(projectId, protocol.id);
    await enqueueQuickEvaluation(projectId, protocol.id);
  }
  const jobs = await quickJobsRepository.list(projectId);
  let findings = null;
  let publish = null;
  let revealed = false;
  if (jobs.some(job => job.kind === 'evaluate' && job.status === 'completed')) {
    const review = await getHumanReviewWorkspace(projectId);
    revealed = review?.status === 'revealed';
    findings = await getExperienceFindingsWorkspace(projectId);
  }
  if (input.operation === 'confirm' && findings?.latest?.effectiveOutput) {
    await confirmExperienceFindings(projectId, findings.latest.id, findings.latest.effectiveOutput);
    await enqueueQuickWriting(projectId, findings.latest.id);
    await enqueueQuickWriting(projectId, findings.latest.id);
  }
  if (findings?.latest?.humanConfirmedAt) publish = await getPublishWorkspace(projectId);
  return Response.json({ protocol: protocol ? { id: protocol.id, status: protocol.status } : null,
    jobs: jobs.map(job => ({ id: job.id, kind: job.kind, status: job.status, stage: job.stage, error: job.error_message })),
    revealed, findings: findings?.latest ? { id: findings.latest.id, status: findings.latest.status, confirmed: Boolean(findings.latest.humanConfirmedAt) } : null,
    publish: publish?.pack ? { status: publish.pack.status, version: publish.pack.version } : null });
}
