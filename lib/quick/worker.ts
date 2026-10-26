import 'server-only';
import { z } from 'zod';
import { quickJobsRepository } from '@/lib/repositories/quick-jobs.repository';
import { protocolsRepository } from '@/lib/repositories/protocols.repository';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { setQuickPreparationStatus } from '@/lib/services/projects.service';
import { executeProductResearch, getResearchWorkspace } from '@/lib/services/research.service';
import { generateProtocol } from '@/lib/services/protocols.service';
import { advanceQuickEvaluation } from '@/lib/services/quick-evaluation.service';
import { generateExperienceFindings, getExperienceFindingsWorkspace } from '@/lib/services/findings.service';
import { discoverContentIdeas, generateCommunityPost, getPublishWorkspace, regeneratePreparedCommunityPost } from '@/lib/services/publish.service';
import { generateFinalResultAnalysis } from '@/lib/services/result-analysis.service';
import { generateReport } from '@/lib/services/report.service';
import { publishConfigSchema } from '@/lib/ai/schemas/publish.schemas';
import { quickExecution, QuickYield } from './checkpoints';
import type { NextQuickJob, QuickJob } from './types';
import type { Json } from '@/lib/types/database';

const writingPayload = z.object({ findingsId: z.string().uuid(), config: publishConfigSchema, packId: z.string().uuid().optional() });

export async function runQuickWorker(projectId?: string, maxJobs = 8) {
  for (let index = 0; index < maxJobs; index++) {
    const job = await quickJobsRepository.claim(projectId);
    if (!job) return;
    const scope = { job, retryable: false, aiCalls: 0 };
    const heartbeat = setInterval(() => {
      void quickJobsRepository.heartbeat(job).catch(() => console.error('[QuickWorker] Could not renew lease.'));
    }, 60_000);
    heartbeat.unref();
    try { await quickExecution.run(scope, async () => {
      try {
        if (job.kind === 'research' || job.kind === 'protocol') await setQuickPreparationStatus(job.project_id, 'running');
        await requireCurrentWritingJob(job);
        // Check scope before recovering interrupted rows: an old-round job
        // must not fail or reuse work belonging to replacement uploads.
        if (['evaluate', 'findings'].includes(job.kind)) await requireProtocol(job);
        if (['discovery', 'publish', 'analysis', 'report'].includes(job.kind)) {
          const regeneration = job.payload && typeof job.payload === 'object' && !Array.isArray(job.payload) && job.payload.mode === 'regenerate';
          if (!regeneration) {
            const findingsId = ['analysis', 'report'].includes(job.kind) ? job.scope : writingPayload.parse(job.payload).findingsId;
            await requireFindings(job.project_id, findingsId);
          }
        }
        await recoverInterruptedRun(job);
        const outcome = await executeJob(job);
        if (job.kind === 'protocol') await setQuickPreparationStatus(job.project_id, 'completed');
        await quickJobsRepository.finish(job, 'completed', outcome.result ?? null, null, outcome.next);
      } catch (error) {
        if (error instanceof QuickYield) {
          const retryEpoch = job.result && typeof job.result === 'object' && !Array.isArray(job.result) ? job.result.retryEpoch : undefined;
          await quickJobsRepository.finish(job, 'queued', { continuation: true, ...(typeof retryEpoch === 'string' ? { retryEpoch } : {}) });
          return;
        }
        const message = error instanceof Error ? error.message : '后台任务失败，请重试当前阶段。';
        if (job.kind === 'research' || job.kind === 'protocol') await setQuickPreparationStatus(job.project_id, 'failed', message);
        const regeneration = job.payload && typeof job.payload === 'object' && !Array.isArray(job.payload) && job.payload.mode === 'regenerate';
        await quickJobsRepository.finish(job, !regeneration && scope.retryable && job.attempts < 3 ? 'queued' : 'failed', null, message);
      }
    }); } finally { clearInterval(heartbeat); }
  }
}

async function executeJob(job: QuickJob): Promise<{ result?: Json; next?: NextQuickJob }> {
  const projectId = job.project_id;
  switch (job.kind) {
    case 'research': {
      const workspace = await getResearchWorkspace(projectId);
      const id = workspace?.completedResult?.researchRunId ?? await executeProductResearch(projectId);
      return { result: { researchRunId: id }, next: { kind: 'protocol', scope: id } };
    }
    case 'protocol': {
      const existing = (await protocolsRepository.listByProject(projectId)).find(protocol => protocol.research_run_id === job.scope);
      const id = existing?.id ?? await generateProtocol(projectId);
      return { result: { protocolId: id } };
    }
    case 'evaluate': {
      await requireProtocol(job);
      const result = await advanceQuickEvaluation(projectId, job.scope);
      return { result, ...(result.next === 'findings' ? { next: { kind: 'findings' as const, scope: job.scope } } : {}) };
    }
    case 'findings': {
      await requireProtocol(job);
      const id = await generateExperienceFindings(projectId);
      return { result: { findingsId: id } };
    }
    case 'discovery': {
      const payload = writingPayload.parse(job.payload);
      await requireFindings(projectId, payload.findingsId);
      const workspace = await getPublishWorkspace(projectId);
      if (!workspace?.pack?.ideas.length || workspace.pack.status === 'failed') await discoverContentIdeas(projectId);
      const prepared = await getPublishWorkspace(projectId);
      return { next: { kind: 'publish', scope: job.scope, payload: { ...payload, packId: prepared?.pack?.id } as unknown as Json } };
    }
    case 'publish': {
      const regeneration = z.object({ mode: z.literal('regenerate'), packId: z.string().uuid() }).safeParse(job.payload);
      if (regeneration.success) return { result: { packId: await regeneratePreparedCommunityPost(projectId, regeneration.data.packId) } };
      const payload = writingPayload.parse(job.payload);
      await requireFindings(projectId, payload.findingsId);
      const workspace = await getPublishWorkspace(projectId);
      if (workspace?.pack?.status === 'ready' && workspace.pack.completedAt && workspace.pack.completedAt >= job.created_at) return { result: { packId: workspace.pack.id }, next: { kind: 'analysis', scope: payload.findingsId } };
      const idea = workspace?.pack?.ideas.find(item => item.recommended) ?? workspace?.pack?.ideas[0];
      if (!idea) throw new Error('当前材料没有可用选题，请补充证据或调整发现。');
      const id = await generateCommunityPost(projectId, { ideaId: idea.id, config: payload.config, expectedPackId: payload.packId });
      return { result: { packId: id }, next: { kind: 'analysis', scope: payload.findingsId } };
    }
    case 'analysis': {
      await requireFindings(projectId, job.scope);
      const id = await generateFinalResultAnalysis(projectId);
      return { result: { analysisId: id }, next: { kind: 'report', scope: job.scope } };
    }
    case 'report': {
      await requireFindings(projectId, job.scope);
      const id = await generateReport(projectId);
      return { result: { reportId: id } };
    }
  }
}

// Retrying an old job must never adopt a newer article, including a revision
// that still displays the previous ready copy while it is being generated.
async function requireCurrentWritingJob(job: QuickJob) {
  if (!['discovery', 'publish'].includes(job.kind)) return;
  const jobs = await quickJobsRepository.list(job.project_id);
  if (jobs.some(next => ['discovery', 'publish'].includes(next.kind) && Date.parse(next.created_at) > Date.parse(job.created_at))) {
    throw new Error('已有更新的文章任务，请刷新查看；旧任务已停止。');
  }
  const target = z.object({ packId: z.string().uuid() }).safeParse(job.payload);
  if (target.success && (await getPublishWorkspace(job.project_id))?.pack?.id !== target.data.packId) {
    throw new Error('文章版本已变化，旧任务已停止，请刷新查看。');
  }
}

async function requireProtocol(job: QuickJob) {
  const latest = (await protocolsRepository.listByProject(job.project_id))[0];
  if (latest?.id !== job.scope || latest.status !== 'locked') throw new Error('任务引用的测试方案已变化，请回到工作台继续。');
}
async function requireFindings(projectId: string, findingsId: string) {
  const workspace = await getExperienceFindingsWorkspace(projectId);
  if (workspace?.latest?.id !== findingsId || !workspace.latest.humanConfirmedAt) throw new Error('测评发现已变化，请重新确认后生成文章。');
}

// Only recover this worker's interrupted attempts, never an older experiment.
async function recoverInterruptedRun(job: QuickJob) {
  // Writing resumes its fixed pack and saved stages. Broad timestamp recovery
  // can otherwise fail a newer revision owned by another job.
  if (job.kind === 'publish') return;
  if (job.result && typeof job.result === 'object' && !Array.isArray(job.result) && job.result.continuation === true) return;
  const table = ({ research: 'research_runs', evaluate: 'judge_runs', findings: 'experience_findings', discovery: 'publish_packs', publish: 'publish_packs', analysis: 'result_analyses', report: 'reports' } as const)[job.kind as Exclude<QuickJob['kind'], 'protocol'>];
  if (!table) return;
  const client = getSupabaseServerClient();
  let query = client.from(table).update({ status: 'failed', error_message: '后台执行中断，保留该次记录并从已保存阶段恢复。' })
    .eq('project_id', job.project_id).in('status', ['pending', 'running', 'discovering', 'generating']);
  const payload = z.object({ packId: z.string().uuid() }).safeParse(job.payload);
  query = payload.success && table === 'publish_packs' ? query.eq('id', payload.data.packId) : query.gte('created_at', job.created_at);
  const { error } = await query;
  if (error) throw new Error('恢复中断任务失败，请重试。');
}
