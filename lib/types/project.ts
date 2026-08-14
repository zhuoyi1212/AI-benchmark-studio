export type ProjectStatus =
  | "draft"
  | "researching"
  | "research_ready"
  | "protocol_draft"
  | "protocol_locked"
  | "testing"
  | "reviewing"
  | "review_locked"
  | "completed"
  | "reported"
  | "published";

export type BenchmarkProduct = {
  id: string;
  name: string;
  officialUrl?: string;
  logoUrl?: string;
  initials: string;
  color: string;
};

export type BenchmarkProject = {
  id: string;
  name: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt?: string;
  intent: string;
  products: BenchmarkProduct[];
  progress: {
    completed: number;
    total: number;
    percent: number;
  };
};

export type ProjectDraft = Pick<BenchmarkProject, "name" | "intent"> & {
  products: Array<Pick<BenchmarkProduct, "name"> & { officialUrl?: string }>;
};
