import { mockNewProjectDraft, mockProjectRecord, mockWorkflow } from "@/lib/mock/project.mock";
import { mockProtocol, PROTOCOL_STORAGE_KEY } from "@/lib/mock/protocol.mock";
import { createMockCommunityPost, createMockContentIdeas, mockPublishChannels, mockPublishConfig, mockPublishGoals, mockScreenshots } from "@/lib/mock/publish.mock";
import { createMockBenchmarkReport } from "@/lib/mock/report.mock";
import { mockResearchResponse } from "@/lib/mock/research.mock";
import { createMockFinalResultAnalysis } from "@/lib/mock/results.mock";
import { mockBlindMappings, mockBlindSamples, mockInitialReviewScores, mockJudgeResults, mockStoredReview, REVIEW_STORAGE_KEY } from "@/lib/mock/review.mock";
import { mockTestRuns } from "@/lib/mock/test-execution.mock";
import { calculateFinalProductScores, getRevealedProduct, getReviewSummary, parseStoredReview } from "@/lib/review-state";
import type { BenchmarkProject } from "@/lib/types/project";
import type { TestProtocol } from "@/lib/types/protocol";
import type { BenchmarkScreenshot, CommunityPost, ContentIdea, PublishConfig } from "@/lib/types/publish";
import type { AIJudgeScore, BlindSample, FinalProductScore, StoredReview } from "@/lib/types/review";
import type { FinalResultAnalysis } from "@/lib/types/results";
import type { BenchmarkReport } from "@/lib/types/report";
import type { ResearchResponse } from "@/lib/types/research";
import type { TestRun } from "@/lib/types/test-run";
import type { StageAccess, StageDependency } from "@/lib/types/workflow";

export { PROTOCOL_STORAGE_KEY, REVIEW_STORAGE_KEY };

export const WORKFLOW_STAGE_DEPENDENCIES: StageDependency[] = [
  { stage: "project" },
  { stage: "research", dependsOn: "project" },
  { stage: "protocol", dependsOn: "research" },
  { stage: "test_run", dependsOn: "protocol" },
  { stage: "judge", dependsOn: "test_run" },
  { stage: "human_review", dependsOn: "judge" },
  { stage: "final_result_analysis", dependsOn: "human_review" },
  { stage: "report", dependsOn: "final_result_analysis" },
  { stage: "publish", dependsOn: "report" },
];

export type ReviewWorkspace = {
  project: BenchmarkProject;
  protocol: TestProtocol;
  samples: BlindSample[];
  judgeResults: AIJudgeScore[];
  review: StoredReview;
};

export type ResultsWorkspace = {
  project: BenchmarkProject;
  protocol: TestProtocol;
  judgeResults: AIJudgeScore[];
  review: StoredReview;
  finalScores: FinalProductScore[];
  analysis: FinalResultAnalysis;
  reviewSummary: ReturnType<typeof getReviewSummary>;
};

export type ReportWorkspace = ResultsWorkspace & {
  research: ResearchResponse;
  testRuns: TestRun[];
  report: BenchmarkReport;
};

export type PublishWorkspace = ReportWorkspace & {
  contentIdeas: ContentIdea[];
  communityPost: CommunityPost;
  publishConfig: PublishConfig;
  publishChannels: string[];
  publishGoals: string[];
  screenshots: BenchmarkScreenshot[];
};

export function getProject(projectId: string): BenchmarkProject {
  assertProjectId(projectId);
  const runs = mockTestRuns.filter((run) => run.projectId === projectId);
  const completed = runs.filter((run) => run.status === "uploaded" || run.status === "ready_for_review").length;
  const total = runs.length;
  return { ...mockProjectRecord, progress: { completed, total, percent: total === 0 ? 0 : Math.round(completed / total * 100) } };
}

export function getProjects(projectId: string) { return [getProject(projectId)]; }
export function getNewProjectDraft(projectId: string) { assertProjectId(projectId); return mockNewProjectDraft; }
export function getWorkflow(projectId: string) { assertProjectId(projectId); return mockWorkflow; }
export function getProductsCatalog(projectId: string) { return getResearchResult(projectId).products; }

export function getResearchResult(projectId: string) {
  getProject(projectId);
  return mockResearchResponse;
}

export function getProtocol(projectId: string, storedValue?: string | null): TestProtocol {
  getResearchResult(projectId);
  if (storedValue) {
    try {
      const parsed = JSON.parse(storedValue) as TestProtocol;
      if (parsed.projectId === projectId && parsed.id === mockProtocol.id && parsed.status === "locked") return parsed;
    } catch { /* Ignore invalid Mock storage. */ }
  }
  return mockProtocol;
}

export function getTestRuns(projectId: string) {
  getProtocol(projectId);
  return mockTestRuns.filter((run) => run.projectId === projectId);
}

export function getTestExecutionWorkspace(projectId: string) {
  return { project: getProject(projectId), protocol: getProtocol(projectId), testRuns: getTestRuns(projectId) };
}

export function getJudgeResults(projectId: string) {
  getTestRuns(projectId);
  return mockJudgeResults.filter(() => mockProtocol.projectId === projectId);
}

export function getReviewWorkspace(projectId: string, storedValue?: string | null): ReviewWorkspace {
  const judgeResults = getJudgeResults(projectId);
  const review = parseStoredReview(storedValue ?? null, projectId, mockInitialReviewScores) ?? { ...mockStoredReview, scores: mockStoredReview.scores.map((score) => ({ ...score })) };
  return { project: getProject(projectId), protocol: getProtocol(projectId), samples: mockBlindSamples, judgeResults, review };
}

export function revealProductForReview(projectId: string, review: StoredReview, sampleId: string) {
  if (review.status !== "revealed") return undefined;
  const project = getProject(projectId);
  return getRevealedProduct(sampleId, review.status, { protocol: getProtocol(projectId), judgeResults: getJudgeResults(projectId), mappings: mockBlindMappings, samples: mockBlindSamples, products: project.products });
}

export function getFinalResultAnalysis(projectId: string, review: StoredReview): StageAccess<ResultsWorkspace> {
  if (review.status !== "revealed") return denied(projectId);
  const project = getProject(projectId);
  const protocol = getProtocol(projectId);
  const judgeResults = getJudgeResults(projectId);
  const finalScores = calculateFinalProductScores(review.scores, review.status, { protocol, judgeResults, mappings: mockBlindMappings, samples: mockBlindSamples, products: project.products });
  const analysis = createMockFinalResultAnalysis(projectId, review, finalScores);
  return granted({ project, protocol, judgeResults, review, finalScores, analysis, reviewSummary: getReviewSummary(review.scores) });
}

export function getResultsWorkspace(projectId: string, storedValue?: string | null): StageAccess<ResultsWorkspace> {
  const { review } = getReviewWorkspace(projectId, storedValue);
  return getFinalResultAnalysis(projectId, review);
}

export function getReportWorkspace(projectId: string, storedValue?: string | null): StageAccess<ReportWorkspace> {
  const results = getResultsWorkspace(projectId, storedValue);
  if (!results.ok) return results;
  const research = getResearchResult(projectId);
  const testRuns = getTestRuns(projectId);
  const report = createMockBenchmarkReport({ ...results.data, research, testRuns });
  return granted({ ...results.data, research, testRuns, report });
}

export function getPublishWorkspace(projectId: string, storedValue?: string | null, refreshIndex = 0): StageAccess<PublishWorkspace> {
  const reportResult = getReportWorkspace(projectId, storedValue);
  if (!reportResult.ok) return reportResult;
  const contentIdeas = createMockContentIdeas(reportResult.data.analysis, reportResult.data.finalScores, refreshIndex);
  const communityPost = createMockCommunityPost(reportResult.data.project, reportResult.data.analysis, reportResult.data.finalScores, mockPublishConfig, contentIdeas.find((idea) => idea.recommended) ?? contentIdeas[0]);
  return granted({ ...reportResult.data, contentIdeas, communityPost, publishConfig: mockPublishConfig, publishChannels: mockPublishChannels, publishGoals: mockPublishGoals, screenshots: mockScreenshots });
}

export async function discoverContentIdeas(projectId: string, review: StoredReview, refreshIndex = 0): Promise<StageAccess<ContentIdea[]>> {
  const result = getFinalResultAnalysis(projectId, review);
  return result.ok ? granted(createMockContentIdeas(result.data.analysis, result.data.finalScores, refreshIndex)) : result;
}

export async function generateCommunityPost(projectId: string, review: StoredReview, config: PublishConfig, selectedIdea: ContentIdea): Promise<StageAccess<CommunityPost>> {
  const result = getFinalResultAnalysis(projectId, review);
  return result.ok ? granted(createMockCommunityPost(result.data.project, result.data.analysis, result.data.finalScores, config, selectedIdea)) : result;
}

function assertProjectId(projectId: string) { if (projectId !== mockProjectRecord.id) throw new Error(`Unknown Mock project: ${projectId}`); }
function denied(projectId: string): StageAccess<never> { return { ok: false, requiredStage: "human_review", redirectTo: `/projects/${projectId}/review`, reason: "review_not_revealed" }; }
function granted<T>(data: T): StageAccess<T> { return { ok: true, data }; }
