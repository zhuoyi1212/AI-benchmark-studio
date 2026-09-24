export type ProtocolStatus = "draft" | "locked";
export type ExpectedOutputType = "text" | "image" | "document" | "video" | "code" | "mixed";

export type TestRule = { id: string; text: string };

export type ProtocolInputArtifact = {
  id: string;
  name: string;
  type: "application/pdf" | "text/plain" | "text/csv";
  description: string;
  downloadUrl?: string;
};

export type TestCase = {
  id: string;
  title: string;
  objective: string;
  prompt: string;
  inputDescription?: string;
  inputArtifacts?: ProtocolInputArtifact[];
  expectedOutputTypes: ExpectedOutputType[];
  evidenceRequirements: string[];
  observationFocus: string[];
  executionRules?: string[];
};

export type RubricDimension = {
  id: string;
  name: string;
  weight: number;
  description?: string;
  scoringStandard: {
    excellent?: string;
    good?: string;
    acceptable?: string;
    poor?: string;
  };
};

export type TestProtocol = {
  id: string;
  projectId: string;
  researchRunId: string;
  version: number;
  title: string;
  goal: string;
  status: ProtocolStatus;
  testMode: "standardized" | "best_practice" | "mixed";
  rules: TestRule[];
  testCases: TestCase[];
  rubric: RubricDimension[];
  createdAt: string;
  lockedAt?: string;
};
