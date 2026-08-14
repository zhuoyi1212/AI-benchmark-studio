import type { ProductResultSummary } from "@/lib/types/results";

export type ReportRankingItem = { productId: string; productName: string; score: number; rank: number };

export type ReportCaseReview = {
  testCaseId: string;
  title: string;
  objective: string;
  prompt: string;
  findings: string;
  productResults: Array<{
    productId: string;
    productName: string;
    score: number;
    analysis: string;
    artifactIds: string[];
  }>;
};

export type BenchmarkReport = {
  id: string;
  projectId: string;
  title: string;
  subtitle?: string;
  eyebrow: string;
  readingTime: string;
  tldr: string;
  tldrDetail?: string;
  methodology: { summary: string; rules: string[] };
  ranking: ReportRankingItem[];
  whyTheseProducts: string;
  caseReviews: ReportCaseReview[];
  productSummaries: ProductResultSummary[];
  finalRecommendation: string;
  limitations: string[];
  generatedAt: string;
};
