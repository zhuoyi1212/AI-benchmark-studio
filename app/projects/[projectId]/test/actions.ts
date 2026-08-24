"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  finalizeTestExecution,
  TestExecutionError,
  uploadTestArtifact,
} from "@/lib/services/test-execution.service";

const idSchema = z.string().uuid();

export type TestExecutionActionState = {
  ok: boolean;
  message: string | null;
};

export async function uploadTestArtifactAction(
  _previousState: TestExecutionActionState,
  formData: FormData,
): Promise<TestExecutionActionState> {
  const projectId = idSchema.safeParse(formData.get("projectId"));
  const testRunId = idSchema.safeParse(formData.get("testRunId"));
  const uploadedFile = formData.get("artifact");
  const rawTextEntry = formData.get("rawText");
  const rawText = typeof rawTextEntry === "string" ? rawTextEntry : "";
  if (!projectId.success || !testRunId.success) return { ok: false, message: "测试项标识无效。" };
  const file = uploadedFile instanceof File && uploadedFile.size > 0
    ? uploadedFile
    : rawText.trim().length > 0
      ? new File([rawText], "pasted-raw-output.txt", { type: "text/plain" })
      : null;
  if (!file) return { ok: false, message: "请选择结果文件，或直接粘贴原始文本结果。" };

  try {
    await uploadTestArtifact({
      projectId: projectId.data,
      testRunId: testRunId.data,
      file,
      metadata: {
        generationTimeSeconds: parseOptionalInteger(formData.get("generationTimeSeconds")),
        retryCount: parseInteger(formData.get("retryCount")),
        manuallyEdited: formData.get("manuallyEdited") === "on",
        notes: parseOptionalText(formData.get("notes")),
      },
    });
  } catch (error) {
    if (error instanceof TestExecutionError || error instanceof z.ZodError) {
      return { ok: false, message: error instanceof TestExecutionError ? error.message : "测试执行元数据无效。" };
    }
    throw error;
  }

  revalidatePath(`/projects/${projectId.data}/test`);
  revalidatePath("/projects");
  return { ok: true, message: "原始测试结果已保存。" };
}

export async function finalizeTestExecutionAction(
  _previousState: TestExecutionActionState,
  formData: FormData,
): Promise<TestExecutionActionState> {
  const projectId = idSchema.safeParse(formData.get("projectId"));
  const protocolId = idSchema.safeParse(formData.get("protocolId"));
  if (!projectId.success || !protocolId.success) return { ok: false, message: "Protocol 标识无效。" };
  try {
    await finalizeTestExecution(projectId.data, protocolId.data);
  } catch (error) {
    if (error instanceof TestExecutionError) return { ok: false, message: error.message };
    throw error;
  }
  revalidatePath(`/projects/${projectId.data}/test`);
  revalidatePath("/projects");
  return { ok: true, message: "全部测试结果已就绪。" };
}

function parseInteger(value: FormDataEntryValue | null) {
  return typeof value === "string" ? Number(value) : Number.NaN;
}

function parseOptionalInteger(value: FormDataEntryValue | null) {
  return typeof value !== "string" || value.trim() === "" ? null : Number(value);
}

function parseOptionalText(value: FormDataEntryValue | null) {
  return typeof value !== "string" || value.trim() === "" ? null : value.trim();
}
