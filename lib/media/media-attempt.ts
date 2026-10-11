import "server-only";
import { quickExecution, QuickYield } from "@/lib/quick/checkpoints";
import { quickJobsRepository } from "@/lib/repositories/quick-jobs.repository";
import { createInputSignature } from "@/lib/signatures";

/** A failed optional media read is a durable warning, never a successful AI output.
 * Continuations must not spend every invocation retrying the same broken frame.
 * An explicit retry (result.continuation absent) tries it again.
 */
export async function mediaAttempt<T>(input: unknown, execute: () => Promise<T>): Promise<T> {
  const scope = quickExecution.getStore();
  const retryEpoch = scope?.job.result && typeof scope.job.result === 'object' && !Array.isArray(scope.job.result) ? scope.job.result.retryEpoch : undefined;
  const key = `media-degraded:${createInputSignature(input)}:${typeof retryEpoch === 'string' ? retryEpoch : 'initial'}`;
  const continuation = scope?.job.result && typeof scope.job.result === "object" && !Array.isArray(scope.job.result) && scope.job.result.continuation === true;
  if (scope && continuation && await quickJobsRepository.readStep(scope.job.id, key) !== undefined) throw new Error("Previously failed optional media read");
  try { return await execute(); }
  catch (error) {
    if (error instanceof QuickYield) throw error;
    if (scope) await quickJobsRepository.saveStep(scope.job, key, { status: "failed", warning: "optional_media_read_failed" });
    throw error;
  }
}
