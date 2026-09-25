"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { isEvaluationMode } from "@/lib/project-mode";
import { RepositoryError } from "@/lib/repositories/repository-error";
import { setProjectEvaluationMode } from "@/lib/services/projects.service";
import { prepareProjectProtocol } from "@/lib/services/quick-project-preparation.service";

export type ProjectSettingsActionState = { message: string | null };

export async function updateProjectModeAction(
  _previousState: ProjectSettingsActionState,
  formData: FormData,
): Promise<ProjectSettingsActionState> {
  const projectId = z.string().uuid().safeParse(formData.get("projectId"));
  const mode = formData.get("evaluationMode");
  if (!projectId.success || typeof mode !== "string" || !isEvaluationMode(mode)) return { message: "项目模式无效。" };
  try {
    await setProjectEvaluationMode(projectId.data, mode);
  } catch (error) {
    if (error instanceof RepositoryError) return { message: "Protocol 锁定后不能切换模式。" };
    throw error;
  }
  revalidatePath(`/projects/${projectId.data}`, "layout");
  revalidatePath("/projects");
  after(async () => {
    try {
      await prepareProjectProtocol(projectId.data);
      revalidatePath(`/projects/${projectId.data}`, "layout");
    } catch (error) {
      console.error("[ProjectPreparation] failed after mode switch", {
        projectId: projectId.data,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  redirect(`/projects/${projectId.data}/protocol`);
}
