export type ProductResultSummary = {
  productId: string;
  productName: string;
  finalScore: number;
  rank?: number;
  headline: string;
  strengths: string[];
  weaknesses: string[];
  bestFor: string[];
  notIdealFor: string[];
  keyFindings: string[];
};

export type FinalResultAnalysis = {
  projectId: string;
  winner?: { productId: string; reason: string };
  products: ProductResultSummary[];
  crossProductInsights: string[];
  recommendationSummary: string;
  limitations?: string[];
};
