import type { ProjectWorkflowState } from "@/lib/types/workflow-navigation";

export const demoWorkflowState: ProjectWorkflowState = {
  projectId: "demo",
  stages: {
    research: { completed: true, accessible: true, lockedReason: null },
    protocol: { completed: true, accessible: true, lockedReason: null },
    test: { completed: true, accessible: true, lockedReason: null },
    review: { completed: true, accessible: true, lockedReason: null },
    results: { completed: true, accessible: true, lockedReason: null },
    report: { completed: true, accessible: true, lockedReason: null },
    publish: { completed: true, accessible: true, lockedReason: null },
  },
};
