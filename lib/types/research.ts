export type ResearchSource = {
  title: string;
  url: string;
  sourceType: "official_website" | "documentation" | "pricing" | "help_center" | "blog" | "other";
  snippet: string;
  siteName: string | null;
  publishedAt: string | null;
};

export type ProductResearch = {
  productId: string;
  name: string;
  officialUrl?: string;
  logoUrl?: string;
  initials: string;
  positioning: string;
  targetUsers: string[];
  capabilities: string[];
  keyFeatures: string[];
  pricing?: {
    summary: string;
    freePlan?: string;
    paidFrom?: string;
    currency?: string;
  };
  officialBestPractices?: string[];
  limitations?: string[];
  inputFormats: string[];
  outputFormats: string[];
  sources: ResearchSource[];
  snapshot?: {
    id: string;
    version: number;
    researchedAt: string;
    validUntil: string;
    reused: boolean;
    stale: boolean;
  };
};

export type ComparabilityResult = {
  status: "comparable" | "partially_comparable" | "not_comparable";
  score?: number;
  reason: string;
  commonCapabilities: string[];
  warnings?: string[];
};

export type ResearchResponse = {
  projectId: string;
  researchRunId: string;
  version: number;
  products: ProductResearch[];
  comparability: ComparabilityResult;
  generatedAt: string;
};
