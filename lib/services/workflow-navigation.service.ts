import "server-only";

import { workflowNavigationRepository } from "@/lib/repositories/workflow-navigation.repository";
import type { ProjectWorkflowState } from "@/lib/types/workflow-navigation";
import { deriveWorkflowState } from "@/lib/workflow-navigation-state";

export async function getProjectWorkflowState(projectId: string): Promise<ProjectWorkflowState | null> {
  const snapshot = await workflowNavigationRepository.load(projectId);
  return snapshot ? deriveWorkflowState(snapshot) : null;
}
