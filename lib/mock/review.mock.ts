import type { AIJudgeScore, BlindMapping, BlindSample, ReviewScore, StoredReview } from "@/lib/types/review";
import { mockProject } from "@/lib/mock/project.mock";
import { mockProtocol } from "@/lib/mock/protocol.mock";

export const REVIEW_STORAGE_KEY = "ai-benchmark-review-v3";

export const mockBlindSamples: BlindSample[] = [
  { sampleId: "sample-a", label: "Sample A" },
  { sampleId: "sample-b", label: "Sample B" },
  { sampleId: "sample-c", label: "Sample C" },
];

export const mockBlindMappings: BlindMapping[] = [
  { sampleId: "sample-a", productId: "gamma" },
  { sampleId: "sample-b", productId: "canva" },
  { sampleId: "sample-c", productId: "beautiful" },
];

const baseScores: Record<string, Record<string, number>> = {
  "sample-a": { completeness: 9.2, accuracy: 8.8, structure: 8.9, visual_design: 8.7, chart_quality: 8.2, editability: 8.1 },
  "sample-b": { completeness: 8.5, accuracy: 8.6, structure: 8.1, visual_design: 9.1, chart_quality: 7.8, editability: 9.0 },
  "sample-c": { completeness: 7.8, accuracy: 8.4, structure: 8.2, visual_design: 8.6, chart_quality: 7.2, editability: 7.1 },
};

const caseOffsets: Record<string, number> = { "01": 0.1, "02": 0, "03": -0.1, "04": -0.2 };

const judgeCopy: Record<string, { reason: string; evidence: string[]; confidence: number }> = {
  completeness: { reason: "核心任务覆盖完整，主要模块与必要结论均有呈现。", evidence: ["目标、分析、结论和行动建议均能在原始输出中定位。"], confidence: 0.94 },
  accuracy: { reason: "输出基本忠实于原始输入，数据与事实没有明显偏移。", evidence: ["关键数字与输入表格逐项核对。", "单位和统计口径基本一致。"], confidence: 0.92 },
  structure: { reason: "页面之间递进自然，标题层级能够支撑快速理解。", evidence: ["目录、章节过渡与总结页构成完整叙事链路。"], confidence: 0.88 },
  visual_design: { reason: "版式整体一致，重点信息具备清晰的视觉层级。", evidence: ["标题、正文与关键数据形成稳定的三级视觉关系。"], confidence: 0.76 },
  chart_quality: { reason: "图表类型与数据关系基本匹配，主要趋势表达清楚。", evidence: ["趋势使用折线或柱形表达。", "图例和标签保持可读。"], confidence: 0.86 },
  editability: { reason: "页面元素结构清晰，生成后可以继续进行常规修改。", evidence: ["文本、图表与装饰元素多数保持为独立可编辑对象。"], confidence: 0.7 },
};

export const mockJudgeResults: AIJudgeScore[] = mockProtocol.testCases.flatMap((testCase) =>
  mockBlindSamples.flatMap((sample) =>
    mockProtocol.rubric.map((dimension) => {
      const copy = judgeCopy[dimension.id];
      return {
        id: `${testCase.id}-${sample.sampleId}-${dimension.id}`,
        testCaseId: testCase.id,
        sampleId: sample.sampleId,
        rubricDimensionId: dimension.id,
        rubricDimensionName: dimension.name,
        aiScore: roundOne(clamp((baseScores[sample.sampleId]?.[dimension.id] ?? 0) + (caseOffsets[testCase.id] ?? 0))),
        reason: copy.reason,
        evidence: copy.evidence,
        confidence: copy.confidence,
        judgeModel: "Mock Judge v1",
        judgedAt: "2026-08-14T09:30:00.000Z",
      } satisfies AIJudgeScore;
    }),
  ),
);

export const mockInitialReviewScores: ReviewScore[] = mockJudgeResults.map((judgeScore) => ({
  judgeScoreId: judgeScore.id,
  aiScore: judgeScore.aiScore,
  finalScore: judgeScore.aiScore,
}));

export const mockStoredReview: StoredReview = {
  projectId: mockProject.id,
  status: "reviewing",
  scores: mockInitialReviewScores,
  updatedAt: "2026-08-14T09:31:00.000Z",
};

export const mockRevealedReview: StoredReview = { ...mockStoredReview, status: "revealed" };

function clamp(value: number) { return Math.min(10, Math.max(0, value)); }
function roundOne(value: number) { return Math.round(value * 10) / 10; }
