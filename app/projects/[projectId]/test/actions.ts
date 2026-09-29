"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { BlindReviewError, startProfessionalReview } from "@/lib/services/blind-review.service";
import {
  finalizeTestExecution,
  TestExecutionError,
  uploadTestArtifact,
} from "@/lib/services/test-execution.service";
import { QuickEvaluationError } from "@/lib/services/quick-evaluation.service";
import { enqueueQuickEvaluation } from "@/lib/services/quick-workflow.service";
import { wakeQuickWorker } from "@/lib/quick/dispatch";
import { getTestExecutionWorkspace } from "@/lib/services/test-execution.service";

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

  if (formData.get('quickBatchComplete') === 'true') {
    try {
      const test = await getTestExecutionWorkspace(projectId.data);
      if (test?.project.evaluationMode === 'quick') {
        await enqueueQuickEvaluation(projectId.data, test.protocol.id);
        wakeQuickWorker(projectId.data);
      }
    } catch {
      // The file is already saved. Keep upload success and expose the workbench recovery action.
      console.error('[QuickWorker] Artifact saved; evaluation enqueue needs retry.');
    }
  }
  revalidatePath(`/projects/${projectId.data}/quick`);
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

export async function startProfessionalReviewAction(
  _previousState: TestExecutionActionState,
  formData: FormData,
): Promise<TestExecutionActionState> {
  const projectId = idSchema.safeParse(formData.get("projectId"));
  const protocolId = idSchema.safeParse(formData.get("protocolId"));
  if (!projectId.success || !protocolId.success) return { ok: false, message: "项目或 Protocol 标识无效。" };

  try {
    await startProfessionalReview(projectId.data, protocolId.data);
  } catch (error) {
    if (error instanceof BlindReviewError) return { ok: false, message: error.message };
    throw error;
  }

  revalidatePath(`/projects/${projectId.data}/test`);
  revalidatePath(`/projects/${projectId.data}/review`);
  revalidatePath("/projects");
  redirect(`/projects/${projectId.data}/review`);
}

export async function advanceQuickEvaluationAction(
  _previousState: TestExecutionActionState,
  formData: FormData,
): Promise<TestExecutionActionState> {
  const projectId = idSchema.safeParse(formData.get("projectId"));
  const protocolId = idSchema.safeParse(formData.get("protocolId"));
  if (!projectId.success || !protocolId.success) return { ok: false, message: "项目或 Protocol 标识无效。" };

  try {
    await enqueueQuickEvaluation(projectId.data, protocolId.data);
    wakeQuickWorker(projectId.data);
    revalidatePath(`/projects/${projectId.data}/quick`);
    redirect(`/projects/${projectId.data}/quick`);
  } catch (error) {
    if (error instanceof QuickEvaluationError || error instanceof TestExecutionError || error instanceof BlindReviewError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
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
