export type TestRunStatus = "pending" | "uploaded" | "invalid" | "ready_for_review";

export type TestArtifact = {
  id: string;
  fileName: string;
  fileType: string;
  fileUrl?: string;
  previewUrl?: string;
  createdAt: string;
};

export type TestRun = {
  id: string;
  projectId: string;
  testCaseId: string;
  productId: string;
  status: TestRunStatus;
  generationTimeSeconds?: number;
  retryCount?: number;
  manuallyEdited?: boolean;
  notes?: string;
  artifacts: TestArtifact[];
};
