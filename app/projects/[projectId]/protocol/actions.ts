"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  generateProtocol,
  lockProtocol,
  ProtocolExecutionError,
} from "@/lib/services/protocols.service";

const projectIdSchema = z.string().uuid();
const protocolIdSchema = z.string().uuid();

export type ProtocolActionState = { message: string | null };

export async function generateProtocolAction(
  _previousState: ProtocolActionState,
  formData: FormData,
): Promise<ProtocolActionState> {
  const projectId = projectIdSchema.safeParse(formData.get("projectId"));
  if (!projectId.success) return { message: "项目标识无效。" };
  const path = `/projects/${projectId.data}/protocol`;

  try {
    await generateProtocol(projectId.data);
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
