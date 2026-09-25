import "server-only";

import { startProfessionalReview } from "@/lib/services/blind-review.service";
import { getHumanReviewWorkspace, lockHumanReview, revealHumanReview } from "@/lib/services/human-review.service";
import { getJudgeReviewWorkspace, runBlindJudge } from "@/lib/services/judge.service";
import { finalizeTestExecution, getTestExecutionWorkspace } from "@/lib/services/test-execution.service";

export class QuickEvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuickEvaluationError";
  }
}

export async function advanceQuickEvaluation(
  projectId: string,
  protocolId: string,
): Promise<{ next: "review" | "findings"; reviewSessionId: string }> {
  const test = await getTestExecutionWorkspace(projectId);
  if (!test || test.protocol.id !== protocolId) throw new QuickEvaluationError("当前锁定方案与测试记录不一致。");
  if (test.project.evaluationMode !== "quick") throw new QuickEvaluationError("只有快速模式会自动推进评分。");
  if (test.testRuns.some((run) => run.artifacts.length === 0)) throw new QuickEvaluationError("仍有产品没有上传有效原始结果。");

  if (test.testRuns.some((run) => run.status !== "ready_for_review")) {
    await finalizeTestExecution(projectId, protocolId);
  }

  let judge = null;
  try {
    judge = await getJudgeReviewWorkspace(projectId);
  } catch {
    // No Blind Samples exist yet; the explicit start below creates them.
  }
  if (!judge) await startProfessionalReview(projectId, protocolId);
  await runBlindJudge(projectId);

  const review = await getHumanReviewWorkspace(projectId);
  if (!review) throw new QuickEvaluationError("AI Judge 已结束，但复核会话尚未建立，请重试。");
  if (review.summary.anomalies > 0) return { next: "review", reviewSessionId: review.reviewSessionId };

  await lockHumanReview(projectId, review.reviewSessionId);
  await revealHumanReview(projectId, review.reviewSessionId);
  return { next: "findings", reviewSessionId: review.reviewSessionId };
}
