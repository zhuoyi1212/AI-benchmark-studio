"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  HumanReviewError,
  lockHumanReview,
  revealHumanReview,
  revertHumanOverride,
  saveHumanOverride,
  getHumanReviewWorkspace,
} from "@/lib/services/human-review.service";
import { enqueueQuickFindings } from "@/lib/services/quick-workflow.service";
import { wakeQuickWorker } from "@/lib/quick/dispatch";

const idSchema = z.string().uuid();
const scoreSchema = z.coerce.number().min(0).max(10).refine((value) => Number.isInteger(value * 10), "评分最多保留一位小数。");
const reasonSchema = z.string().trim().min(1, "请填写修改理由。").max(2000, "修改理由不能超过 2000 字。");
const reviewIdsSchema = z.object({ projectId: idSchema, reviewSessionId: idSchema });
const scoreIdsSchema = reviewIdsSchema.extend({ judgeScoreId: idSchema });

export type HumanReviewActionState = { message: string | null };

export async function saveHumanOverrideAction(
  _previousState: HumanReviewActionState,
  formData: FormData,
): Promise<HumanReviewActionState> {
  const input = z.object({
    projectId: idSchema,
    reviewSessionId: idSchema,
    judgeScoreId: idSchema,
    score: scoreSchema,
    reason: reasonSchema,
  }).safeParse(Object.fromEntries(formData));
  if (!input.success) return { message: input.error.issues[0]?.message ?? "评分输入无效。" };
  try {
    await saveHumanOverride(input.data.projectId, input.data.reviewSessionId, input.data.judgeScoreId, input.data.score, input.data.reason);
  } catch (error) {
    if (error instanceof HumanReviewError) return { message: error.message };
    throw error;
  }
  refreshReview(input.data.projectId);
}

export async function revertHumanOverrideAction(
  _previousState: HumanReviewActionState,
  formData: FormData,
): Promise<HumanReviewActionState> {
  const input = scoreIdsSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { message: "复核记录标识无效。" };
  try {
    await revertHumanOverride(input.data.projectId, input.data.reviewSessionId, input.data.judgeScoreId);
  } catch (error) {
    if (error instanceof HumanReviewError) return { message: error.message };
    throw error;
  }
  refreshReview(input.data.projectId);
}

export async function lockHumanReviewAction(
  _previousState: HumanReviewActionState,
  formData: FormData,
): Promise<HumanReviewActionState> {
  const input = reviewIdsSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { message: "复核会话标识无效。" };
  try {
    await lockHumanReview(input.data.projectId, input.data.reviewSessionId);
  } catch (error) {
    if (error instanceof HumanReviewError) return { message: error.message };
    throw error;
  }
  refreshReview(input.data.projectId);
}

export async function revealHumanReviewAction(
  _previousState: HumanReviewActionState,
  formData: FormData,
): Promise<HumanReviewActionState> {
  const input = reviewIdsSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { message: "复核会话标识无效。" };
  try {
    await revealHumanReview(input.data.projectId, input.data.reviewSessionId);
  } catch (error) {
    if (error instanceof HumanReviewError) return { message: error.message };
    throw error;
  }
  refreshReview(input.data.projectId);
}

export async function completeQuickReviewAction(
  _previousState: HumanReviewActionState,
  formData: FormData,
): Promise<HumanReviewActionState> {
  const input = reviewIdsSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { message: "复核会话标识无效。" };
  try {
    const workspace = await getHumanReviewWorkspace(input.data.projectId);
    if (!workspace || workspace.reviewSessionId !== input.data.reviewSessionId || workspace.evaluationMode !== "quick") {
      return { message: "当前快速复核会话已变化，请刷新页面。" };
    }
    if (workspace.status === "reviewing") await lockHumanReview(input.data.projectId, input.data.reviewSessionId);
    if (workspace.status !== "revealed") await revealHumanReview(input.data.projectId, input.data.reviewSessionId);
    await enqueueQuickFindings(input.data.projectId, workspace.protocolId);
    wakeQuickWorker(input.data.projectId);
  } catch (error) {
    if (error instanceof HumanReviewError) return { message: error.message };
    throw error;
  }
  revalidatePath(`/projects/${input.data.projectId}/review`);
  revalidatePath("/projects");
  redirect(`/projects/${input.data.projectId}/quick`);
}

function refreshReview(projectId: string): never {
  const path = `/projects/${projectId}/review`;
  revalidatePath(path);
  revalidatePath("/projects");
  redirect(path);
}
