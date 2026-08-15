import type { FinalProductScore, StoredReview } from "@/lib/types/review";
import type { FinalResultAnalysis, ProductResultSummary } from "@/lib/types/results";

export function createMockFinalResultAnalysis(projectId: string, review: StoredReview, finalScores: FinalProductScore[]): FinalResultAnalysis {
  if (review.status !== "revealed") throw new Error("Final result analysis requires a revealed review.");
  const rankedScores = [...finalScores].sort((a, b) => b.finalScore - a.finalScore);
  const products = rankedScores.map((score, index) => createProductSummary(score, index));
  const winner = rankedScores[0];
  const runnerUp = rankedScores[1];
  const leadingDimensions = winner ? [...winner.dimensionScores].sort((a, b) => b.score - a.score).slice(0, 2) : [];
  const scoreGap = winner && runnerUp ? Math.round((winner.finalScore - runnerUp.finalScore) * 10) / 10 : 0;

  return {
    projectId,
    generatedFrom: {
      reviewStatus: "revealed",
      reviewUpdatedAt: review.updatedAt,
      finalScoreSignature: rankedScores.map((item) => `${item.productId}:${item.finalScore}:${item.dimensionScores.map((dimension) => `${dimension.dimensionId}=${dimension.score}`).join(",")}`).join("|"),
    },
    winner: winner ? {
      productId: winner.productId,
      reason: `${winner.productName} 以 ${winner.finalScore.toFixed(1)} 分位列第一${runnerUp ? `，领先第二名 ${scoreGap.toFixed(1)} 分` : ""}；优势主要来自${leadingDimensions.map((item) => item.name).join("与")}。`,
    } : undefined,
    products,
    crossProductInsights: createCrossProductInsights(rankedScores),
    recommendationSummary: rankedScores.map((item, index) => {
      const topDimension = [...item.dimensionScores].sort((a, b) => b.score - a.score)[0];
      return `${index + 1}. ${item.productName}：适合优先关注${topDimension?.name ?? "综合表现"}的用户`;
    }).join("；"),
    limitations: ["结论来自当前锁定的 Final Score；人工调整评分后需要重新生成分析。", "Mock 分析仅用于验证数据链路，不代表真实产品能力。"],
  };
}

function createProductSummary(score: FinalProductScore, index: number): ProductResultSummary {
  const sortedDimensions = [...score.dimensionScores].sort((a, b) => b.score - a.score);
  const strongest = sortedDimensions.slice(0, 2);
  const weakest = sortedDimensions.slice(-1);
  return {
    productId: score.productId,
    productName: score.productName,
    finalScore: score.finalScore,
    rank: index + 1,
    headline: `${strongest.map((item) => item.name).join("与")}是当前评分中的主要优势`,
    strengths: strongest.map((item) => `${item.name} ${item.score.toFixed(1)} 分`),
    weaknesses: weakest.map((item) => `${item.name} ${item.score.toFixed(1)} 分，仍有提升空间`),
    bestFor: strongest.map((item) => `重视${item.name}的用户`),
    notIdealFor: weakest.map((item) => `将${item.name}作为首要需求的用户`),
    keyFindings: [`综合排名第 ${index + 1}`, `最终得分 ${score.finalScore.toFixed(1)}`, `${score.adjustedCount} 项评分经过人工调整`],
  };
}

function createCrossProductInsights(scores: FinalProductScore[]) {
  const dimensionNames = scores[0]?.dimensionScores.map((item) => item.name) ?? [];
  return dimensionNames.map((name) => {
    const values = scores.map((score) => score.dimensionScores.find((item) => item.name === name)?.score ?? 0);
    const gap = Math.max(...values) - Math.min(...values);
    return { name, gap };
  }).sort((a, b) => b.gap - a.gap).slice(0, 2).map((item) => `${item.name}是当前产品间差异较明显的维度，最高与最低相差 ${item.gap.toFixed(1)} 分。`);
}
