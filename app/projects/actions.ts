"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { RepositoryError } from "@/lib/repositories/repository-error";
import { softDeleteProject } from "@/lib/services/projects.service";

export type DeleteProjectActionResult =
  | { ok: true }
  | { ok: false; message: string };

const projectIdSchema = z.string().uuid();

export async function deleteProjectAction(projectId: string): Promise<DeleteProjectActionResult> {
  const parsed = projectIdSchema.safeParse(projectId);
  if (!parsed.success) return { ok: false, message: "项目 ID 无效。" };

  try {
    const deleted = await softDeleteProject(parsed.data);
    if (!deleted) return { ok: false, message: "项目不存在或已被删除。" };
  } catch (error) {
    if (error instanceof RepositoryError) {
      return { ok: false, message: "项目删除失败，请稍后重试。" };
    }
    throw error;
  }

  revalidatePath("/projects");
  return { ok: true };
}
