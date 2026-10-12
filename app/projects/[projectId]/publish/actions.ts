"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from 'next/headers';
import { wakeQuickWorker } from '@/lib/quick/dispatch';
import { z } from "zod";
import { discoverContentIdeas, generateCommunityPost, refreshCommunityPostTitle, saveCommunityPostEdit, enqueueCommunityPostRegeneration, PublishExecutionError } from "@/lib/services/publish.service";

const projectIdSchema = z.string().uuid();
export type PublishActionState = { message: string | null };
export type TitleRefreshActionState = { message: string | null; title: string | null; packId: string | null };
export type PostEditActionState = { message: string | null; success: boolean };

export async function savePostEditAction(_state: PostEditActionState, formData: FormData): Promise<PostEditActionState> {
  if ((await headers()).get('x-ai-benchmark-access') !== 'admin') return { message: '请以管理员身份保存修改。', success: false };
  const ids = z.object({ projectId: projectIdSchema, sourcePackId: projectIdSchema }).safeParse({ projectId: formData.get('projectId'), sourcePackId: formData.get('sourcePackId') });
  if (!ids.success) return { message: '文章版本无效，请刷新后重试。', success: false };
  try {
    await saveCommunityPostEdit(ids.data.projectId, ids.data.sourcePackId, {
      title: formData.get('title'), body: formData.get('body'),
      tags: String(formData.get('tags') ?? '').trim().split(/\s+/).filter(Boolean),
      interactionQuestion: formData.get('interactionQuestion'), imageIds: formData.getAll('imageId'),
    });
    revalidatePath(`/projects/${ids.data.projectId}/publish`);
    revalidatePath(`/projects/${ids.data.projectId}/quick`);
    return { message: null, success: true };
  } catch (error) {
    if (error instanceof PublishExecutionError) return { message: error.message, success: false };
    throw error;
  }
}

export async function regeneratePostAction(_state: PostEditActionState, formData: FormData): Promise<PostEditActionState> {
  if ((await headers()).get('x-ai-benchmark-access') !== 'admin') return { message: '请以管理员身份重新生成。', success: false };
  const ids = z.object({ projectId: projectIdSchema, sourcePackId: projectIdSchema }).safeParse({ projectId: formData.get('projectId'), sourcePackId: formData.get('sourcePackId') });
  if (!ids.success) return { message: '文章版本无效，请刷新后重试。', success: false };
  try {
    await enqueueCommunityPostRegeneration(ids.data.projectId, ids.data.sourcePackId);
    wakeQuickWorker(ids.data.projectId);
    revalidatePath(`/projects/${ids.data.projectId}/publish`);
    revalidatePath(`/projects/${ids.data.projectId}/quick`);
    return { message: null, success: true };
  } catch (error) {
    if (error instanceof PublishExecutionError) return { message: error.message, success: false };
    throw error;
  }
}

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
    personalRatingEnabled: formData.get("personalRatingEnabled") === "true",
    personalRatingScale: Number(formData.get("personalRatingScale") ?? 5),
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

export async function refreshPostTitleAction(
  state: TitleRefreshActionState,
  formData: FormData,
): Promise<TitleRefreshActionState> {
  const projectId = projectIdSchema.safeParse(formData.get("projectId"));
  const sourcePackId = projectIdSchema.safeParse(formData.get("sourcePackId"));
  if (!projectId.success || !sourcePackId.success) return { message: "文章版本无效，请刷新页面后重试。", title: null, packId: state.packId };
  const path = `/projects/${projectId.data}/publish`;
  try {
    const result = await refreshCommunityPostTitle(projectId.data, sourcePackId.data);
    revalidatePath(path);
    revalidatePath(`/projects/${projectId.data}/quick`);
    return { message: null, title: result.title, packId: result.packId };
  } catch (error) {
    if (error instanceof PublishExecutionError) return { message: error.message, title: null, packId: state.packId };
    throw error;
  }
}
