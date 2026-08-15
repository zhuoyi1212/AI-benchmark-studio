import { calculateCaseScore } from "@/lib/review-state";
import type { BenchmarkProject } from "@/lib/types/project";
import type { TestProtocol } from "@/lib/types/protocol";
import type { BenchmarkReport } from "@/lib/types/report";
import type { AIJudgeScore, FinalProductScore, StoredReview } from "@/lib/types/review";
import type { FinalResultAnalysis } from "@/lib/types/results";
import type { ResearchResponse } from "@/lib/types/research";
import type { TestRun } from "@/lib/types/test-run";

type ReportInput = {
  project: BenchmarkProject;
  research: ResearchResponse;
  protocol: TestProtocol;
  testRuns: TestRun[];
  judgeResults: AIJudgeScore[];
  review: StoredReview;
  finalScores: FinalProductScore[];
  analysis: FinalResultAnalysis;
};

export function createMockBenchmarkReport(input: ReportInput): BenchmarkReport {
  if (input.review.status !== "revealed") throw new Error("Report requires a revealed review.");
  const winner = input.finalScores[0];
  const runnerUp = input.finalScores[1];
  const ranking = input.finalScores.map((score, index) => ({ productId: score.productId, productName: score.productName, score: score.finalScore, rank: index + 1 }));
  const reviewContext = { protocol: input.protocol, judgeResults: input.judgeResults };
  return {
    id: `report-${input.project.id}-${input.analysis.generatedFrom.finalScoreSignature}`,
    projectId: input.project.id,
    eyebrow: `AI 产品深度测评 · ${new Date(input.review.updatedAt).getFullYear()}`,
    title: `${input.project.products.map((product) => product.name).join("、")}：本轮标准化测评结果`,
    subtitle: `本报告基于 ${input.protocol.testCases.length} 类任务、${input.testRuns.length} 项测试和 ${input.protocol.rubric.length} 个评分维度生成，全部结论使用锁定并揭晓后的 Final Score。`,
    readingTime: `${Math.max(5, input.protocol.testCases.length * 4)} 分钟阅读`,
    tldr: winner ? `${winner.productName} 以 ${winner.finalScore.toFixed(1)} 分位列本轮综合第一。` : "本轮暂无可用排名。",
    tldrDetail: input.analysis.recommendationSummary,
    methodology: {
      summary: "AI Judge 在隐藏产品身份的情况下完成初始评分。随后由人工在同样保持 Blind 的状态下复核证据，锁定 Final Score 后才揭晓身份并生成本报告。",
      rules: input.protocol.rules.map((rule) => rule.text),
    },
    ranking,
    whyTheseProducts: input.research.products.map((product) => `${product.name}：${product.positioning}`).join("；"),
    caseReviews: input.protocol.testCases.map((testCase) => {
      const productResults = input.finalScores.map((product) => ({
        productId: product.productId,
        productName: product.productName,
        score: calculateCaseScore(input.review.scores, product.sampleId, testCase.id, reviewContext),
        analysis: "",
        artifactIds: input.testRuns.find((run) => run.productId === product.productId && run.testCaseId === testCase.id)?.artifacts.map((artifact) => artifact.id) ?? [],
      })).sort((a, b) => b.score - a.score).map((product, index, items) => ({
        ...product,
        analysis: `${product.score.toFixed(1)} 分，本 Case 排名第 ${index + 1}${items[0] ? `，与本 Case 最高分相差 ${(items[0].score - product.score).toFixed(1)} 分` : ""}。`,
      }));
      return {
        testCaseId: testCase.id,
        title: testCase.title,
        objective: testCase.objective,
        prompt: testCase.prompt,
        findings: productResults[0] && productResults[1] ? `${productResults[0].productName} 在本 Case 领先 ${productResults[1].productName} ${(productResults[0].score - productResults[1].score).toFixed(1)} 分。` : "本 Case 已完成评分。",
        productResults,
      };
    }),
    productSummaries: input.analysis.products,
    finalRecommendation: input.analysis.recommendationSummary,
    limitations: input.analysis.limitations ?? [],
    generatedAt: input.review.updatedAt,
  };
}
