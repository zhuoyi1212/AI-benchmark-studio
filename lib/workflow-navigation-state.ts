import type { WorkflowNavigationSnapshot } from "./repositories/workflow-navigation.repository.js";
import type { Json } from "./types/database.js";
import type { ProjectWorkflowState, WorkflowStageAccess } from "./types/workflow-navigation.js";

export function deriveWorkflowState(snapshot: WorkflowNavigationSnapshot): ProjectWorkflowState {
  const completedResearch = snapshot.researchRuns.filter((run) => run.status === "completed");
  const latestCompletedResearch = completedResearch[0] ?? null;
  const lockedProtocolIds = new Set(snapshot.protocols.filter((protocol) => protocol.status === "locked").map((protocol) => protocol.id));
  const artifactRunIds = new Set(snapshot.artifactRunIds);
  const completedTestProtocolIds = new Set<string>();

  for (const protocolId of lockedProtocolIds) {
    const testCaseCount = snapshot.testCases.filter((testCase) => testCase.protocolId === protocolId).length;
    const runs = snapshot.testRuns.filter((run) => run.protocolId === protocolId);
    const expectedRunCount = testCaseCount * snapshot.productCount;
    if (expectedRunCount > 0 && runs.length === expectedRunCount
      && runs.every((run) => run.status === "ready_for_review" && artifactRunIds.has(run.id))) {
      completedTestProtocolIds.add(protocolId);
    }
  }

  const confirmedFindingIds = new Set(snapshot.experienceFindings
    .filter((finding) => finding.status === "completed" && finding.humanConfirmedAt && completedTestProtocolIds.has(finding.protocolId))
    .map((finding) => finding.id));
  const completedJudgeRunIds = new Set(snapshot.judgeRuns
    .filter((run) => run.status === "completed" && completedTestProtocolIds.has(run.protocolId))
    .map((run) => run.id));
  const revealedReviewIds = new Set(snapshot.reviewSessions
    .filter((review) => review.status === "revealed" && completedJudgeRunIds.has(review.judgeRunId))
    .map((review) => review.id));
  const completedAnalysisIds = new Set(snapshot.resultAnalyses
    .filter((analysis) => analysis.status === "completed" && revealedReviewIds.has(analysis.reviewSessionId))
    .map((analysis) => analysis.id));
  const completedReportIds = new Set(snapshot.reports
    .filter((report) => report.status === "completed" && completedAnalysisIds.has(report.resultAnalysisId))
    .map((report) => report.id));
  const reportCanPublish = snapshot.evaluationMode === "professional" && completedReportIds.size > 0;
  const publishCompleted = snapshot.publishPacks.some((pack) => pack.status === "ready" && (
    (pack.findingsId !== null && confirmedFindingIds.has(pack.findingsId))
    || (snapshot.evaluationMode === "professional" && pack.reportId !== null && completedReportIds.has(pack.reportId))
  ));

  const researchCompleted = completedResearch.length > 0;
  const protocolCompleted = lockedProtocolIds.size > 0;
  const testCompleted = completedTestProtocolIds.size > 0;
  const reviewCompleted = revealedReviewIds.size > 0;
  const resultsCompleted = confirmedFindingIds.size > 0;
  const reportCompleted = completedReportIds.size > 0;
  const protocolAllowedByResearch = researchCompleted && (
    snapshot.productCount === 1 || comparabilityStatus(latestCompletedResearch?.comparability) !== "not_comparable"
  );

  return {
    projectId: snapshot.projectId,
    evaluationMode: snapshot.evaluationMode,
    stages: {
      research: stage(researchCompleted, true, null),
      protocol: stage(protocolCompleted, snapshot.protocols.length > 0 || protocolAllowedByResearch,
        !researchCompleted ? "请先完成产品调研" : "当前产品不适合标准化横向测评"),
      test: stage(testCompleted, protocolCompleted, "请先锁定测评方案"),
      review: stage(reviewCompleted, testCompleted, "请先完成测试执行"),
      results: stage(resultsCompleted, reviewCompleted, "请先完成 Blind Judge、必要的异常复核和揭盲"),
      report: stage(reportCompleted, completedAnalysisIds.size > 0, "请先完成可选的专业评分与结果分析"),
      publish: stage(publishCompleted, resultsCompleted || reportCanPublish, snapshot.evaluationMode === "quick" ? "请先人工确认测评发现" : "请先确认测评发现，或完成专业深度报告"),
    },
  };
}

function stage(completed: boolean, accessible: boolean, lockedReason: string | null): WorkflowStageAccess {
  return { completed, accessible: completed || accessible, lockedReason: completed || accessible ? null : lockedReason };
}

function comparabilityStatus(value: Json | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return typeof value.status === "string" ? value.status : null;
}
