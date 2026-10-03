"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { RepositoryError } from "@/lib/repositories/repository-error";
import { renameProject, softDeleteProject } from "@/lib/services/projects.service";
import { projectNameSchema } from "@/lib/project-name";

export type DeleteProjectActionResult =
  | { ok: true }
  | { ok: false; message: string };

const projectIdSchema = z.string().uuid();

export async function renameProjectAction(projectId: string, name: string): Promise<DeleteProjectActionResult> {
  const parsedId = projectIdSchema.safeParse(projectId);
  const parsedName = projectNameSchema.safeParse(name);
  if (!parsedId.success) return { ok: false, message: "测评 ID 无效。" };
  if (!parsedName.success) return { ok: false, message: parsedName.error.issues[0]?.message ?? "测评名称无效。" };
  try {
    if (!await renameProject(parsedId.data, parsedName.data)) return { ok: false, message: "测评不存在或已被删除。" };
  } catch (error) {
    if (error instanceof RepositoryError) {
      return { ok: false, message: error.code === "23505" ? "已有同名测评，请换一个名称。" : "名称保存失败，请稍后重试。" };
    }
    throw error;
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

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
