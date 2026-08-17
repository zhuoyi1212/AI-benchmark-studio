"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { executeProductResearch, ResearchExecutionError } from "@/lib/services/research.service";

const projectIdSchema = z.string().uuid();

export type ResearchActionState = { message: string | null };

export async function startResearchAction(
  _previousState: ResearchActionState,
  formData: FormData,
): Promise<ResearchActionState> {
  const parsedProjectId = projectIdSchema.safeParse(formData.get("projectId"));
  if (!parsedProjectId.success) return { message: "项目标识无效。" };
  const path = `/projects/${parsedProjectId.data}/research`;

  try {
    await executeProductResearch(parsedProjectId.data);
  } catch (error) {
    if (error instanceof ResearchExecutionError) {
      revalidatePath(path);
      revalidatePath("/projects");
      return { message: error.message };
    }
    throw error;
  }

  revalidatePath(path);
  revalidatePath("/projects");
  redirect(path);
}
