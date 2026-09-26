import "server-only";

import { generateProtocol } from "@/lib/services/protocols.service";
import { executeProductResearch } from "@/lib/services/research.service";
import { getProjectSummary, setQuickPreparationStatus } from "@/lib/services/projects.service";

export async function prepareProjectProtocol(projectId: string): Promise<void> {
  await setQuickPreparationStatus(projectId, "running");
  try {
    await executeProductResearch(projectId);
    await generateProtocol(projectId);
    await setQuickPreparationStatus(projectId, "completed");
  } catch (error) {
    await setQuickPreparationStatus(projectId, "failed", error instanceof Error ? error.message.slice(0, 2000) : "快速方案准备失败");
    throw error;
  }
}

export async function resumeQuickProjectPreparation(projectId: string): Promise<boolean> {
  const project = await getProjectSummary(projectId);
  const canResume = project?.evaluationMode === "quick"
    && project.status === "research_ready"
    && ["idle", "failed", "completed"].includes(project.quickPreparation.status);
  if (!canResume) return false;

  await setQuickPreparationStatus(projectId, "running");
  try {
    await generateProtocol(projectId);
    await setQuickPreparationStatus(projectId, "completed");
    return true;
  } catch (error) {
    await setQuickPreparationStatus(projectId, "failed", error instanceof Error ? error.message.slice(0, 2000) : "快速方案准备失败");
    throw error;
  }
}

export const prepareQuickProject = prepareProjectProtocol;
