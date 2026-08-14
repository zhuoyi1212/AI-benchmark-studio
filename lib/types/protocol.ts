export type ProtocolStatus = "draft" | "locked";

export type TestRule = { id: string; text: string };

export type TestCase = {
  id: string;
  title: string;
  objective: string;
  prompt: string;
  inputDescription?: string;
  inputArtifacts?: Array<{ id: string; name: string; type: string }>;
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
