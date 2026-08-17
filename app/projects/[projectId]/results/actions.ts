"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { generateFinalResultAnalysis, ResultAnalysisError } from "@/lib/services/result-analysis.service";

const projectIdSchema = z.string().uuid();
export type ResultAnalysisActionState = { message: string | null };

export async function generateResultAnalysisAction(
  _previousState: ResultAnalysisActionState,
  formData: FormData,
): Promise<ResultAnalysisActionState> {
  const projectId = projectIdSchema.safeParse(formData.get("projectId"));
  if (!projectId.success) return { message: "项目标识无效。" };
  const path = `/projects/${projectId.data}/results`;
  try {
    await generateFinalResultAnalysis(projectId.data);
  } catch (error) {
    if (error instanceof ResultAnalysisError) {
      revalidatePath(path);
      return { message: error.message };
    }
    throw error;
  }
  revalidatePath(path);
  redirect(path);
}
