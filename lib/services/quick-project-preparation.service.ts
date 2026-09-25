import "server-only";

import { generateProtocol } from "@/lib/services/protocols.service";
import { executeProductResearch } from "@/lib/services/research.service";
import { setQuickPreparationStatus } from "@/lib/services/projects.service";

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

export const prepareQuickProject = prepareProjectProtocol;
