import 'server-only';
import { z } from 'zod';
import { quickJobsRepository } from '@/lib/repositories/quick-jobs.repository';
import { protocolsRepository } from '@/lib/repositories/protocols.repository';
import { getHumanReviewWorkspace } from '@/lib/services/human-review.service';
import { getProjectSummary } from '@/lib/services/projects.service';
import { getResearchWorkspace } from '@/lib/services/research.service';
import { getTestExecutionReadiness } from '@/lib/services/test-execution.service';
import { getExperienceFindingsWorkspace } from '@/lib/services/findings.service';
import { createInputSignature } from '@/lib/signatures';
import { defaultPublishConfig } from '@/lib/publish-config';
import { publishConfigSchema } from '@/lib/ai/schemas/publish.schemas';
import type { PublishConfig } from '@/lib/ai/schemas/publish.schemas';
import type { Json } from '@/lib/types/database';

export async function enqueueQuickPreparation(projectId: string) {
  const project = await getProjectSummary(projectId);
  if (!project || project.evaluationMode !== 'quick') throw new Error('快速项目不存在。');
  const protocols = await protocolsRepository.listByProject(projectId);
  if (protocols.length) return;
  const research = await getResearchWorkspace(projectId);
  await quickJobsRepository.enqueue(projectId, research?.completedResult
    ? { kind: 'protocol', scope: research.completedResult.researchRunId }
    : { kind: 'research', scope: projectId });
}

export async function enqueueQuickEvaluation(projectId: string, expectedProtocolId?: string) {
  const test = await getTestExecutionReadiness(projectId);
  if (!test || test.evaluationMode !== 'quick' || (expectedProtocolId && test.protocolId !== expectedProtocolId)) throw new Error('当前测试方案已变化。');
  if (!test.complete) return false;
  const protocolId = test.protocolId;
  const jobs = await quickJobsRepository.list(projectId);
  const evaluated = jobs.find(job => job.kind === 'evaluate' && job.scope === protocolId && job.status === 'completed');
  const findingsReady = evaluated && (await getHumanReviewWorkspace(projectId))?.status === 'revealed';
  await quickJobsRepository.enqueue(projectId, { kind: findingsReady ? 'findings' : 'evaluate', scope: protocolId });
  return true;
}

export async function enqueueQuickWriting(projectId: string, findingsId: string, config?: PublishConfig) {
  const findings = await getExperienceFindingsWorkspace(projectId);
  if (!findings || findings.evaluationMode !== 'quick' || findings.latest?.id !== findingsId || !findings.latest.humanConfirmedAt) {
    throw new Error('请先确认当前测评发现。');
  }
  const jobs = await quickJobsRepository.list(projectId);
  const prior = [...jobs].reverse().find(job => job.kind === 'publish');
  const previous = z.object({ config: publishConfigSchema, findingsId: z.string().optional() }).safeParse(prior?.payload);
  // Reuse formatting preferences across Findings, but keep author judgments with their source.
  const previousConfig = previous.success ? { ...previous.data.config } : undefined;
  if (previousConfig && previous.success && previous.data.findingsId !== findingsId) delete previousConfig.authorPerspective;
  const selected = publishConfigSchema.parse(config ?? (previousConfig ?? {
    ...defaultPublishConfig, structure: '自由结构', length: '250–500 字，材料少则缩短', imageCount: 3,
  }));
  const scope = createInputSignature({ findingsId, findings: findings.latest.effectiveOutput, config: selected });
  await quickJobsRepository.enqueue(projectId, { kind: 'discovery', scope, payload: { findingsId, config: selected } as unknown as Json });
}

export async function getQuickWorkflowJobs(projectId: string) {
  return quickJobsRepository.list(projectId);
}

export async function retryQuickWorkflowJob(projectId: string, jobId: string) {
  const project = await getProjectSummary(projectId);
  if (project?.evaluationMode !== 'quick') throw new Error('快速项目不存在。');
  await quickJobsRepository.retry(projectId, jobId);
}

export async function enqueueQuickFindings(projectId: string, protocolId: string) {
  const review = await getHumanReviewWorkspace(projectId);
  if (review?.evaluationMode !== 'quick' || review.protocolId !== protocolId || review.status !== 'revealed') {
    throw new Error('请先完成当前方案的匿名复核。');
  }
  await quickJobsRepository.enqueue(projectId, { kind: 'findings', scope: protocolId });
}
