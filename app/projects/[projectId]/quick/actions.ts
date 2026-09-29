'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { lockProtocol } from '@/lib/services/protocols.service';
import { getProjectSummary } from '@/lib/services/projects.service';
import { enqueueQuickPreparation, enqueueQuickEvaluation, enqueueQuickWriting, retryQuickWorkflowJob } from '@/lib/services/quick-workflow.service';
import { wakeQuickWorker } from '@/lib/quick/dispatch';

export async function quickAction(_state: { message: string | null }, formData: FormData) {
  const input = z.object({ projectId: z.string().uuid(), operation: z.enum(['adopt', 'retry', 'prepare', 'evaluate', 'write']), id: z.string().uuid().optional() }).safeParse({
    projectId: formData.get('projectId'), operation: formData.get('operation'), id: formData.get('id') || undefined,
  });
  if (!input.success) return { message: '操作参数无效。' };
  const { projectId, operation, id } = input.data;
  try {
    const project = await getProjectSummary(projectId);
    if (project?.evaluationMode !== 'quick') return { message: '快速项目不存在。' };
    if (operation === 'adopt' && id) await lockProtocol(projectId, id);
    else if (operation === 'retry' && id) await retryQuickWorkflowJob(projectId, id);
    else if (operation === 'write' && id) await enqueueQuickWriting(projectId, id);
    else if (operation === 'prepare') await enqueueQuickPreparation(projectId);
    else if (operation === 'evaluate' && id) await enqueueQuickEvaluation(projectId, id);
    else return { message: '缺少当前阶段标识。' };
    wakeQuickWorker(projectId);
    revalidatePath(`/projects/${projectId}/quick`);
    return { message: null };
  } catch (error) { return { message: error instanceof Error ? error.message : '操作失败，请重试。' }; }
}
