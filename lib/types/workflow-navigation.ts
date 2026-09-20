export const workflowStageIds = [
  "research",
  "protocol",
  "test",
  "review",
  "results",
  "report",
  "publish",
] as const;

export type WorkflowStageId = (typeof workflowStageIds)[number];

export type WorkflowStageAccess = {
  completed: boolean;
  accessible: boolean;
  lockedReason: string | null;
};

export type ProjectWorkflowState = {
  projectId: string;
  stages: Record<WorkflowStageId, WorkflowStageAccess>;
};
