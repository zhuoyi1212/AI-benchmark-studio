"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { generateReport, ReportGenerationError } from "@/lib/services/report.service";

const projectIdSchema = z.string().uuid();
export type ReportActionState = { message: string | null };

export async function generateReportAction(
  _previousState: ReportActionState,
  formData: FormData,
): Promise<ReportActionState> {
  const projectId = projectIdSchema.safeParse(formData.get("projectId"));
  if (!projectId.success) return { message: "项目标识无效。" };
  const path = `/projects/${projectId.data}/report`;
  try {
    await generateReport(projectId.data);
  } catch (error) {
    if (error instanceof ReportGenerationError) {
      revalidatePath(path);
      return { message: error.message };
    }
    throw error;
  }
  revalidatePath(path);
  redirect(path);
}
