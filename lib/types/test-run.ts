export type TestRunStatus = "pending" | "uploaded" | "invalid" | "ready_for_review";

export type TestArtifact = {
  id: string;
  kind: "image" | "pdf" | "text";
  fileName: string;
  fileType: string;
  sizeBytes: number;
  sha256?: string;
  fileUrl?: string;
  previewUrl?: string;
  createdAt: string;
};

export type TestRun = {
  id: string;
  projectId: string;
  protocolId: string;
  testCaseId: string;
  productId: string;
  status: TestRunStatus;
  generationTimeSeconds?: number;
  retryCount?: number;
  manuallyEdited?: boolean;
  notes?: string;
  artifacts: TestArtifact[];
};

export type TestExecutionWorkspace = {
  project: {
    id: string;
    name: string;
    products: Array<{ id: string; name: string; initials: string }>;
  };
  protocol: import("@/lib/types/protocol").TestProtocol;
  testRuns: TestRun[];
};
