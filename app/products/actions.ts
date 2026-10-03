"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { RepositoryError } from "@/lib/repositories/repository-error";
import { setProductArchived } from "@/lib/services/product-library.service";

export async function setProductArchivedAction(productId: string, archived: boolean): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!z.string().uuid().safeParse(productId).success || typeof archived !== "boolean") {
    return { ok: false, message: "产品参数无效。" };
  }
  try {
    if (!await setProductArchived(productId, archived)) return { ok: false, message: "产品状态已变化，请刷新后重试。" };
  } catch (error) {
    if (error instanceof RepositoryError) return { ok: false, message: "操作失败，请稍后重试。" };
    throw error;
  }
  revalidatePath("/products", "layout");
  revalidatePath("/projects/new");
  return { ok: true };
}
