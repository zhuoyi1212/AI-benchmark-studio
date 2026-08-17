"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { JudgeExecutionError, runBlindJudge } from "@/lib/services/judge.service";

const projectIdSchema = z.string().uuid();

export type JudgeActionState = { message: string | null };

export async function runBlindJudgeAction(
  _previousState: JudgeActionState,
  formData: FormData,
): Promise<JudgeActionState> {
  const projectId = projectIdSchema.safeParse(formData.get("projectId"));
  if (!projectId.success) return { message: "项目标识无效。" };
  const path = `/projects/${projectId.data}/review`;
  try {
    await runBlindJudge(projectId.data);
  } catch (error) {
    if (error instanceof JudgeExecutionError) {
      revalidatePath(path);
      return { message: error.message };
    }
    throw error;
  }
  revalidatePath(path);
  revalidatePath("/projects");
  redirect(path);
}
