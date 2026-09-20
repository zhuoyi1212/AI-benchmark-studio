"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { discoverContentIdeas, generateCommunityPost, PublishExecutionError } from "@/lib/services/publish.service";

const projectIdSchema = z.string().uuid();
export type PublishActionState = { message: string | null };

export async function discoverIdeasAction(_state: PublishActionState, formData: FormData): Promise<PublishActionState> {
  const projectId = projectIdSchema.safeParse(formData.get("projectId"));
  if (!projectId.success) return { message: "项目标识无效。" };
  const path = `/projects/${projectId.data}/publish`;
  try { await discoverContentIdeas(projectId.data); }
  catch (error) { if (error instanceof PublishExecutionError) { revalidatePath(path); return { message: error.message }; } throw error; }
  revalidatePath(path); redirect(path);
}

export async function generatePostAction(_state: PublishActionState, formData: FormData): Promise<PublishActionState> {
  const projectId = projectIdSchema.safeParse(formData.get("projectId"));
  if (!projectId.success) return { message: "项目标识无效。" };
  const config = {
    channel: formData.get("channel"),
    goal: formData.get("goal"),
    stylePreset: formData.get("stylePreset"),
    structure: formData.get("structure"),
    tone: formData.get("tone"),
    length: formData.get("length"),
    imageCount: formData.get("imageCount"),
    interactionGoal: formData.get("interactionGoal"),
  };
  const path = `/projects/${projectId.data}/publish`;
  try { await generateCommunityPost(projectId.data, { ideaId: String(formData.get("ideaId") ?? ""), customAngle: String(formData.get("customAngle") ?? ""), config }); }
  catch (error) { if (error instanceof PublishExecutionError) { revalidatePath(path); return { message: error.message }; } throw error; }
  revalidatePath(path); redirect(path);
}
