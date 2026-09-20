"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { confirmExperienceFindings, FindingsExecutionError, generateExperienceFindings } from "@/lib/services/findings.service";
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


export async function generateFindingsAction(
  _previousState: ResultAnalysisActionState,
  formData: FormData,
): Promise<ResultAnalysisActionState> {
  const projectId = projectIdSchema.safeParse(formData.get("projectId"));
  if (!projectId.success) return { message: "项目标识无效。" };
  const path = `/projects/${projectId.data}/results`;
  try {
    await generateExperienceFindings(projectId.data);
  } catch (error) {
    if (error instanceof FindingsExecutionError) {
      revalidatePath(path);
      return { message: error.message };
    }
    throw error;
  }
  revalidatePath(path);
  redirect(path);
}

export async function confirmFindingsAction(
  _previousState: ResultAnalysisActionState,
  formData: FormData,
): Promise<ResultAnalysisActionState> {
  const projectId = projectIdSchema.safeParse(formData.get("projectId"));
  const findingsId = z.string().uuid().safeParse(formData.get("findingsId"));
  if (!projectId.success || !findingsId.success) return { message: "项目或 Findings 标识无效。" };

  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { message: "Findings 内容格式无效。" };
  }

  const path = `/projects/${projectId.data}/results`;
  try {
    await confirmExperienceFindings(projectId.data, findingsId.data, payload);
  } catch (error) {
    if (error instanceof FindingsExecutionError || error instanceof z.ZodError) {
      revalidatePath(path);
      return { message: error instanceof z.ZodError ? "请检查每条发现的标题、内容与证据引用。" : error.message };
    }
    throw error;
  }
  revalidatePath(path);
  redirect(path);
}
