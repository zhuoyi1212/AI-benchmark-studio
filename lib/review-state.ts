import { mockProject } from "@/lib/mock/project.mock";
import { mockProtocol } from "@/lib/mock/protocol.mock";
import { mockBlindMappings, mockBlindSamples, mockJudgeResults, mockStoredReview } from "@/lib/mock/review.mock";
import type { FinalProductScore, ReviewScore, ReviewStatus, StoredReview } from "@/lib/types/review";

export function getJudgeScore(reviewScore: ReviewScore) {
  return mockJudgeResults.find((item) => item.id === reviewScore.judgeScoreId);
}

export function calculateCaseScore(scores: ReviewScore[], sampleId: string, testCaseId: string) {
  const items = scores.map((reviewScore) => ({ reviewScore, judgeScore: getJudgeScore(reviewScore) }))
    .filter(({ judgeScore }) => judgeScore?.sampleId === sampleId && judgeScore.testCaseId === testCaseId);
  return roundOne(items.reduce((total, { reviewScore, judgeScore }) => {
    const weight = mockProtocol.rubric.find((dimension) => dimension.id === judgeScore?.rubricDimensionId)?.weight ?? 0;
    return total + reviewScore.finalScore * weight / 100;
  }, 0));
}

export function calculateSampleScore(scores: ReviewScore[], sampleId: string) {
  const caseScores = mockProtocol.testCases.map((testCase) => calculateCaseScore(scores, sampleId, testCase.id));
  return roundOne(caseScores.reduce((total, score) => total + score, 0) / Math.max(caseScores.length, 1));
}

export function calculateFinalProductScores(scores: ReviewScore[], status: ReviewStatus): FinalProductScore[] {
  if (status === "reviewing") return [];
  return mockBlindMappings.map((mapping) => {
    const sample = mockBlindSamples.find((item) => item.sampleId === mapping.sampleId);
    const product = mockProject.products.find((item) => item.id === mapping.productId);
    const dimensionScores = mockProtocol.rubric.map((dimension) => {
      const items = scores.filter((reviewScore) => {
        const judgeScore = getJudgeScore(reviewScore);
        return judgeScore?.sampleId === mapping.sampleId && judgeScore.rubricDimensionId === dimension.id;
      });
      return { dimensionId: dimension.id, name: dimension.name, score: roundOne(items.reduce((total, item) => total + item.finalScore, 0) / Math.max(items.length, 1)) };
    });
    return {
      productId: product?.id ?? mapping.productId,
      productName: product?.name ?? mapping.productId,
      sampleId: mapping.sampleId,
      sampleLabel: sample?.label ?? mapping.sampleId,
      initials: product?.initials ?? "?",
      color: product?.color ?? "bg-slate-400",
      finalScore: roundOne(dimensionScores.reduce((total, item, index) => total + item.score * mockProtocol.rubric[index].weight / 100, 0)),
      dimensionScores,
      adjustedCount: scores.filter((reviewScore) => getJudgeScore(reviewScore)?.sampleId === mapping.sampleId && reviewScore.humanOverride).length,
    };
  }).sort((a, b) => b.finalScore - a.finalScore);
}

export function getReviewSummary(scores: ReviewScore[]) {
  const adjusted = scores.filter((score) => score.humanOverride).length;
  return { total: scores.length, adjusted, accepted: scores.length - adjusted };
}

export function getRevealedProduct(sampleId: string, status: ReviewStatus) {
  if (status !== "revealed") return undefined;
  const productId = mockBlindMappings.find((item) => item.sampleId === sampleId)?.productId;
  return mockProject.products.find((item) => item.id === productId);
}

export function parseStoredReview(value: string | null): StoredReview | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as StoredReview;
    const validStatus = ["reviewing", "locked", "revealed"].includes(parsed.status);
    const expectedIds = new Set(mockStoredReview.scores.map((score) => score.judgeScoreId));
    const validScores = Array.isArray(parsed.scores) && parsed.scores.length === expectedIds.size && parsed.scores.every((score) => expectedIds.has(score.judgeScoreId));
    return validStatus && validScores ? parsed : null;
  } catch {
    return null;
  }
}

function roundOne(value: number) { return Math.round(value * 10) / 10; }
