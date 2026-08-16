export type BenchmarkStage =
  | "project"
  | "research"
  | "protocol"
  | "test_run"
  | "judge"
  | "human_review"
  | "final_result_analysis"
  | "report"
  | "publish";

export type StageDependency = {
  stage: BenchmarkStage;
  dependsOn?: BenchmarkStage;
};

export type StageAccessDenied =
  | {
      ok: false;
      requiredStage: "protocol";
      redirectTo: string;
      reason: "protocol_not_locked";
    }
  | {
      ok: false;
      requiredStage: "human_review";
      redirectTo: string;
      reason: "review_not_revealed";
    };

export type StageAccessGranted<T> = { ok: true; data: T };
export type StageAccess<T> = StageAccessGranted<T> | StageAccessDenied;
