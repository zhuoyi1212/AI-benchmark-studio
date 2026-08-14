export type BlindSample = { sampleId: string; label: string };
export type BlindMapping = { sampleId: string; productId: string };

export type AIJudgeScore = {
  id: string;
  testCaseId: string;
  sampleId: string;
  rubricDimensionId: string;
  rubricDimensionName: string;
  aiScore: number;
  reason: string;
  evidence: string[];
  confidence: number;
  judgeModel?: string;
  judgedAt?: string;
};

export type HumanOverride = { score: number; reason: string; updatedAt: string };

export type ReviewScore = {
  judgeScoreId: string;
  aiScore: number;
  finalScore: number;
  humanOverride?: HumanOverride;
};

export type ReviewStatus = "reviewing" | "locked" | "revealed";

export type StoredReview = {
  projectId: string;
  status: ReviewStatus;
  scores: ReviewScore[];
  updatedAt: string;
};

export type FinalProductScore = {
  productId: string;
  productName: string;
  sampleId: string;
  sampleLabel: string;
  initials: string;
  color: string;
  finalScore: number;
  dimensionScores: Array<{ dimensionId: string; name: string; score: number }>;
  adjustedCount: number;
};
