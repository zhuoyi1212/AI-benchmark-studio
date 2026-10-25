"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { BlindReviewError, startProfessionalReview } from "@/lib/services/blind-review.service";
import {
  completeTestArtifactUpload,
  finalizeTestExecution,
  prepareTestArtifactUpload,
  removeTestArtifact,
  TestExecutionError,
  type ArtifactFileDescriptor,
} from "@/lib/services/test-execution.service";
import type { PreparedArtifactUpload } from "@/lib/types/test-run";
import { QuickEvaluationError } from "@/lib/services/quick-evaluation.service";
import { enqueueQuickEvaluation } from "@/lib/services/quick-workflow.service";
import { wakeQuickWorker } from "@/lib/quick/dispatch";

const idSchema = z.string().uuid();

export type TestExecutionActionState = {
  ok: boolean;
  message: string | null;
};

export type PrepareArtifactUploadActionState = TestExecutionActionState & {
  upload?: PreparedArtifactUpload;
};

export type CompleteArtifactUploadActionState = TestExecutionActionState & {
  restartUpload?: boolean;
};

export async function removeTestArtifactAction(
  _state: TestExecutionActionState, formData: FormData,
): Promise<TestExecutionActionState> {
  if ((await headers()).get('x-ai-benchmark-access') !== 'admin') return { ok: false, message: '请以管理员身份删除文件。' };
  const ids = z.object({ projectId: idSchema, protocolId: idSchema, artifactId: idSchema }).safeParse({
    projectId: formData.get('projectId'), protocolId: formData.get('protocolId'), artifactId: formData.get('artifactId'),
  });
  if (!ids.success) return { ok: false, message: '文件标识无效。' };
  let message: string | null = null;
  try { await removeTestArtifact(ids.data.projectId, ids.data.protocolId, ids.data.artifactId); }
  catch (error) {
    if (error instanceof TestExecutionError) message = error.message;
    else throw error;
  }
  revalidatePath(`/projects/${ids.data.projectId}`, 'layout');
  revalidatePath('/projects');
  revalidatePath('/products');
  return { ok: message === null, message };
}

export async function prepareTestArtifactUploadAction(
  formData: FormData,
): Promise<PrepareArtifactUploadActionState> {
  const projectId = idSchema.safeParse(formData.get("projectId"));
  const testRunId = idSchema.safeParse(formData.get("testRunId"));
  if (!projectId.success || !testRunId.success) return { ok: false, message: "测试项标识无效。" };

  try {
    const upload = await prepareTestArtifactUpload({
      projectId: projectId.data,
      testRunId: testRunId.data,
      file: parseFileDescriptor(formData),
    });
    return { ok: true, message: null, upload };
  } catch (error) {
    if (error instanceof TestExecutionError || error instanceof z.ZodError) {
      return { ok: false, message: error instanceof TestExecutionError ? error.message : "文件信息无效。" };
    }
    throw error;
  }
}

export async function completeTestArtifactUploadAction(
  formData: FormData,
): Promise<CompleteArtifactUploadActionState> {
  const projectId = idSchema.safeParse(formData.get("projectId"));
  const testRunId = idSchema.safeParse(formData.get("testRunId"));
  const artifactId = idSchema.safeParse(formData.get("artifactId"));
  const storagePath = formData.get("storagePath");
  const sha256 = formData.get("sha256");
  if (!projectId.success || !testRunId.success || !artifactId.success || typeof storagePath !== "string" || typeof sha256 !== "string") {
    return { ok: false, message: "上传结果标识无效。", restartUpload: true };
  }

  try {
    await completeTestArtifactUpload({
      projectId: projectId.data,
      testRunId: testRunId.data,
      artifactId: artifactId.data,
      storagePath,
      sha256,
      file: parseFileDescriptor(formData),
      metadata: {
        generationTimeSeconds: parseOptionalInteger(formData.get("generationTimeSeconds")),
        retryCount: parseInteger(formData.get("retryCount")),
        manuallyEdited: formData.get("manuallyEdited") === "on",
        notes: parseOptionalText(formData.get("notes")),
      },
    });
  } catch (error) {
    if (error instanceof TestExecutionError || error instanceof z.ZodError) {
      return {
        ok: false,
        message: error instanceof TestExecutionError ? error.message : "测试执行元数据无效。",
        restartUpload: true,
      };
    }
    throw error;
  }

  if (formData.get('quickBatchComplete') === 'true') {
    try {
      await enqueueQuickEvaluation(projectId.data);
      wakeQuickWorker(projectId.data);
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

function parseFileDescriptor(formData: FormData): ArtifactFileDescriptor {
  return {
    name: formData.get("fileName")?.toString() ?? "",
    size: Number(formData.get("fileSize")),
    type: formData.get("fileType")?.toString() ?? "",
    lastModified: parseOptionalInteger(formData.get("fileLastModified")),
  };
}
