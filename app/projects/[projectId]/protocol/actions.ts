"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  generateProtocol,
  lockProtocol,
  removeDraftTestCase,
  ProtocolExecutionError,
} from "@/lib/services/protocols.service";
import { prepareQuickProject, resumeQuickProjectPreparation } from "@/lib/services/quick-project-preparation.service";
import { ResearchExecutionError } from "@/lib/services/research.service";

const projectIdSchema = z.string().uuid();
const protocolIdSchema = z.string().uuid();

export type ProtocolActionState = { message: string | null };

export async function prepareQuickProtocolAction(
  _previousState: ProtocolActionState,
  formData: FormData,
): Promise<ProtocolActionState> {
  const projectId = projectIdSchema.safeParse(formData.get("projectId"));
  if (!projectId.success) return { message: "项目标识无效。" };
  const path = `/projects/${projectId.data}/protocol`;

  try {
    const resumed = await resumeQuickProjectPreparation(projectId.data);
    if (!resumed) await prepareQuickProject(projectId.data);
  } catch (error) {
    if (error instanceof ResearchExecutionError || error instanceof ProtocolExecutionError) {
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

export async function generateProtocolAction(
  _previousState: ProtocolActionState,
  formData: FormData,
): Promise<ProtocolActionState> {
  const projectId = projectIdSchema.safeParse(formData.get("projectId"));
  if (!projectId.success) return { message: "项目标识无效。" };
  const path = `/projects/${projectId.data}/protocol`;

  try {
    const resumedQuickPreparation = await resumeQuickProjectPreparation(projectId.data);
    if (!resumedQuickPreparation) await generateProtocol(projectId.data);
  } catch (error) {
    if (error instanceof ProtocolExecutionError) {
      revalidatePath(path);
      return { message: error.message };
    }
    throw error;
  }

  revalidatePath(path);
  revalidatePath("/projects");
  redirect(path);
}

export async function lockProtocolAction(
  _previousState: ProtocolActionState,
  formData: FormData,
): Promise<ProtocolActionState> {
  const projectId = projectIdSchema.safeParse(formData.get("projectId"));
  const protocolId = protocolIdSchema.safeParse(formData.get("protocolId"));
  if (!projectId.success || !protocolId.success) return { message: "Protocol 标识无效。" };
  const path = `/projects/${projectId.data}/protocol`;

  try {
    await lockProtocol(projectId.data, protocolId.data);
  } catch (error) {
    if (error instanceof ProtocolExecutionError) {
      revalidatePath(path);
      return { message: error.message };
    }
    throw error;
  }

  revalidatePath(path);
  revalidatePath("/projects");
  redirect(path);
}

export async function removeDraftTestCaseAction(
  _previousState: ProtocolActionState,
  formData: FormData,
): Promise<ProtocolActionState> {
  const projectId = projectIdSchema.safeParse(formData.get("projectId"));
  const protocolId = protocolIdSchema.safeParse(formData.get("protocolId"));
  const testCaseId = protocolIdSchema.safeParse(formData.get("testCaseId"));
  if (!projectId.success || !protocolId.success || !testCaseId.success) {
    return { message: "测试任务标识无效。" };
  }
  const path = `/projects/${projectId.data}/protocol`;

  try {
    await removeDraftTestCase(projectId.data, protocolId.data, testCaseId.data);
  } catch (error) {
    if (error instanceof ProtocolExecutionError) {
      revalidatePath(path);
      return { message: error.message };
    }
    throw error;
  }

  revalidatePath(path);
  revalidatePath("/projects");
  return { message: null };
}
