export type TestRunStatus = "pending" | "uploaded" | "invalid" | "ready_for_review";

export type TestArtifact = {
  id: string;
  kind: "image" | "pdf" | "text" | "video" | "document";
  fileName: string;
  fileType: string;
  sizeBytes: number;
  sha256?: string;
  fileUrl?: string;
  previewUrl?: string;
  createdAt: string;
};

export type PreparedArtifactUpload = {
  artifactId: string;
  storagePath: string;
  signedUrl: string;
  mimeType: string;
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
    evaluationMode: import("@/lib/project-mode").EvaluationMode;
    products: Array<{ id: string; name: string; initials: string }>;
  };
  protocol: import("@/lib/types/protocol").TestProtocol;
  testRuns: TestRun[];
};
