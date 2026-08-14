export type ReviewScore = {
  id: string;
  testCaseId: "01" | "02" | "03" | "04";
  sampleId: "sample-a" | "sample-b" | "sample-c";
  dimension: string;
  dimensionKey: string;
  aiScore: number;
  finalScore: number;
  reason: string;
  evidence: string;
  confidence: "高" | "中";
  humanOverride?: {
    score: number;
    reason: string;
    updatedAt: string;
  };
};

export type FinalProductScore = {
  name: string;
  sample: string;
  initials: string;
  score: number;
  values: number[];
  color: string;
  adjustedCount: number;
};

export const REVIEW_STORAGE_KEY = "ai-benchmark-final-review-v1";
export const REVIEW_DRAFT_STORAGE_KEY = "ai-benchmark-review-draft-v1";

export const reviewDimensions = [
  { key: "completeness", name: "内容完整性", weight: 20 },
  { key: "accuracy", name: "信息准确性", weight: 20 },
  { key: "structure", name: "逻辑结构", weight: 15 },
  { key: "visual_design", name: "视觉设计", weight: 20 },
  { key: "chart_quality", name: "图表质量", weight: 15 },
  { key: "editability", name: "可编辑性", weight: 10 },
] as const;

export const reviewSamples = [
  { id: "sample-a" as const, label: "Sample A", product: "Gamma", initials: "G", color: "bg-blue-600" },
  { id: "sample-b" as const, label: "Sample B", product: "Canva", initials: "C", color: "bg-slate-700" },
  { id: "sample-c" as const, label: "Sample C", product: "Beautiful.ai", initials: "B", color: "bg-slate-400" },
];

const sampleBaseScores = {
  "sample-a": [9.2, 8.8, 8.9, 8.7, 8.2, 8.1],
  "sample-b": [8.5, 8.6, 8.1, 9.1, 7.8, 9.0],
  "sample-c": [7.8, 8.4, 8.2, 8.6, 7.2, 7.1],
};

const caseOffsets = { "01": 0.1, "02": 0, "03": -0.1, "04": -0.2 } as const;

const mockOverrides: Record<string, { score: number; reason: string; updatedAt: string }> = {
  "01-sample-a-visual_design": { score: 8.2, reason: "第 7 页存在明显文字溢出，AI Judge 对该问题扣分不足。", updatedAt: "2026-08-14T10:12:00.000Z" },
  "01-sample-b-editability": { score: 8.7, reason: "多数元素可独立编辑，但两处图表标签被组合，后续修改成本高于 AI 判断。", updatedAt: "2026-08-14T10:18:00.000Z" },
  "02-sample-c-completeness": { score: 8.1, reason: "原始长文中的限制条件已在备注页保留，AI Judge 漏看了该页证据。", updatedAt: "2026-08-14T10:25:00.000Z" },
  "03-sample-a-chart_quality": { score: 7.6, reason: "渠道构成图缺少基准线，虽然趋势正确，但精确比较明显受限。", updatedAt: "2026-08-14T10:31:00.000Z" },
  "04-sample-c-accuracy": { score: 7.8, reason: "一处百分比使用了错误口径，属于会影响结论的信息准确性问题。", updatedAt: "2026-08-14T10:39:00.000Z" },
};

const reasonByDimension: Record<string, string> = {
  completeness: "核心任务覆盖完整，主要模块与必要结论均有呈现。",
  accuracy: "输出基本忠实于原始输入，数据与事实没有明显偏移。",
  structure: "页面之间递进自然，标题层级能够支撑快速理解。",
  visual_design: "版式整体一致，重点信息具备清晰的视觉层级。",
  chart_quality: "图表类型与数据关系基本匹配，主要趋势表达清楚。",
  editability: "页面元素结构清晰，生成后可以继续进行常规修改。",
};

const evidenceByDimension: Record<string, string> = {
  completeness: "目标、分析、结论和行动建议均能在原始输出中定位。",
  accuracy: "关键数字与输入表格逐项核对，单位和统计口径基本一致。",
  structure: "目录、章节过渡与总结页构成完整叙事链路。",
  visual_design: "标题、正文与关键数据形成稳定的三级视觉关系。",
  chart_quality: "趋势使用折线或柱形表达，图例和标签保持可读。",
  editability: "文本、图表与装饰元素多数保持为独立可编辑对象。",
};

export const reviewScores: ReviewScore[] = (["01", "02", "03", "04"] as const).flatMap((testCaseId) =>
  reviewSamples.flatMap((sample) =>
    reviewDimensions.map((dimension, dimensionIndex) => {
      const id = `${testCaseId}-${sample.id}-${dimension.key}`;
      const aiScore = clampScore(sampleBaseScores[sample.id][dimensionIndex] + caseOffsets[testCaseId]);
      const humanOverride = mockOverrides[id];
      return {
        id,
        testCaseId,
        sampleId: sample.id,
        dimension: dimension.name,
        dimensionKey: dimension.key,
        aiScore,
        finalScore: humanOverride?.score ?? aiScore,
        reason: reasonByDimension[dimension.key],
        evidence: evidenceByDimension[dimension.key],
        confidence: dimensionIndex === 3 || dimensionIndex === 5 ? "中" : "高",
        humanOverride,
      } satisfies ReviewScore;
    }),
  ),
);

export function calculateCaseScore(scores: ReviewScore[], sampleId: ReviewScore["sampleId"], testCaseId: ReviewScore["testCaseId"]) {
  const items = scores.filter((score) => score.sampleId === sampleId && score.testCaseId === testCaseId);
  return roundOne(items.reduce((total, item) => total + item.finalScore * (reviewDimensions.find((dimension) => dimension.key === item.dimensionKey)?.weight ?? 0) / 100, 0));
}

export function calculateFinalProductScores(scores: ReviewScore[]): FinalProductScore[] {
  return reviewSamples.map((sample) => {
    const values = reviewDimensions.map((dimension) => {
      const items = scores.filter((score) => score.sampleId === sample.id && score.dimensionKey === dimension.key);
      return roundOne(items.reduce((total, item) => total + item.finalScore, 0) / items.length);
    });
    const score = roundOne(values.reduce((total, value, index) => total + value * reviewDimensions[index].weight / 100, 0));
    return { name: sample.product, sample: sample.label, initials: sample.initials, score, values, color: sample.color, adjustedCount: scores.filter((item) => item.sampleId === sample.id && item.humanOverride).length };
  }).sort((a, b) => b.score - a.score);
}

export function getReviewSummary(scores: ReviewScore[]) {
  const adjusted = scores.filter((score) => score.humanOverride).length;
  return { total: scores.length, adjusted, accepted: scores.length - adjusted };
}

export function parseStoredReview(value: string | null): ReviewScore[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as ReviewScore[];
    return Array.isArray(parsed) && parsed.length === reviewScores.length ? parsed : null;
  } catch {
    return null;
  }
}

function clampScore(score: number) { return roundOne(Math.min(10, Math.max(0, score))); }
function roundOne(value: number) { return Math.round(value * 10) / 10; }
