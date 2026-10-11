import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { quickJobsRepository } from '@/lib/repositories/quick-jobs.repository';
import { createInputSignature } from '@/lib/signatures';
import type { Json } from '@/lib/types/database';
import type { QuickJob } from './types';

export const quickExecution = new AsyncLocalStorage<{ job: QuickJob; retryable: boolean; aiCalls: number; mediaPreparations?: number }>();

// Only immutable Storage objects lose their expiring URL token in cache identities.
function stableInput(input: unknown): string {
  return JSON.stringify(input).replace(/https?:[^\s"\\]+\/storage\/v1\/object\/sign\/[^\s"\\?]+\?[^\s"\\]+/g, url => url.split('?')[0]);
}
export class QuickYield extends Error {
  constructor() { super('Continue from the next saved stage'); this.name = 'QuickYield'; }
}
export async function checkpoint<T>(name: string, input: unknown, execute: () => Promise<T>): Promise<T> {
  const scope = quickExecution.getStore();
  if (!scope) return execute();
  await quickJobsRepository.stage(scope.job, name);
  const key = `${name}:${createInputSignature(stableInput(input))}`;
  const saved = await quickJobsRepository.readStep(scope.job.id, key);
  if (saved !== undefined) return saved as T;
  if (['publish', 'evaluate', 'findings'].includes(scope.job.kind) && scope.aiCalls >= 1) throw new QuickYield();
  scope.aiCalls += 1;
  const result = await execute();
  await quickJobsRepository.saveStep(scope.job, key, JSON.parse(JSON.stringify(result)) as Json);
  return result;
}
