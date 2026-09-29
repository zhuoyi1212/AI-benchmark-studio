"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { RepositoryError } from "@/lib/repositories/repository-error";
import { createProject, setQuickPreparationStatus } from "@/lib/services/projects.service";
import { enqueueQuickPreparation } from "@/lib/services/quick-workflow.service";
import { wakeQuickWorker } from "@/lib/quick/dispatch";
import { isEvaluationMode } from "@/lib/project-mode";

const optionalHttpUrl = z
  .string()
  .trim()
  .max(2048, "官网地址过长")
  .refine((value) => value === "" || isHttpUrl(value), "请输入以 http:// 或 https:// 开头的官网地址");

const projectSchema = z
  .object({
    name: z.string().trim().min(1, "请输入测评名称").max(120, "测评名称不能超过 120 个字符"),
    intent: z.string().trim().min(1, "请输入测评目标").max(4000, "测评目标不能超过 4000 个字符"),
    products: z.array(z.object({
      name: z.string().trim().min(1, "请输入产品名称").max(120, "产品名称不能超过 120 个字符"),
      officialUrl: optionalHttpUrl,
    })).min(1, "至少添加 1 个产品").max(3, "最多添加 3 个产品"),
    evaluationMode: z.custom<"quick" | "professional">(isEvaluationMode, "请选择有效的测评模式"),
  })
  .superRefine(({ products }, context) => {
    const normalizedNames = products.map((product) => product.name.toLocaleLowerCase().replace(/\s+/g, " "));
    if (new Set(normalizedNames).size !== normalizedNames.length) {
      context.addIssue({ code: "custom", path: ["products"], message: "同一项目中不能添加重复产品" });
    }
  });

export type CreateProjectActionState = {
  message: string | null;
};

export async function createProjectAction(
  _previousState: CreateProjectActionState,
  formData: FormData,
): Promise<CreateProjectActionState> {
  const productNames = formData.getAll("productName");
  const productWebsites = formData.getAll("productWebsite");
  const parsed = projectSchema.safeParse({
    name: formData.get("name"),
    intent: formData.get("intent"),
    products: productNames.map((name, index) => ({
      name,
      officialUrl: productWebsites[index] ?? "",
    })),
    evaluationMode: formData.get("evaluationMode"),
  });

  if (!parsed.success) {
    return { message: parsed.error.issues[0]?.message ?? "请检查输入内容" };
  }

  let projectId: string;
  try {
    projectId = await createProject({
      name: parsed.data.name,
      intent: parsed.data.intent,
      products: parsed.data.products.map((product) => ({
        name: product.name,
        officialUrl: product.officialUrl || null,
      })),
      evaluationMode: parsed.data.evaluationMode,
    });
  } catch (error) {
    if (error instanceof RepositoryError) {
      return { message: "项目保存失败，请稍后重试。" };
    }
    throw error;
  }

  revalidatePath("/projects");
  if (parsed.data.evaluationMode === "quick") {
    try {
      await setQuickPreparationStatus(projectId, "idle");
      await enqueueQuickPreparation(projectId);
      wakeQuickWorker(projectId);
    } catch {
      // Project creation succeeded; show its recovery action instead of creating it twice.
      console.error("[QuickWorker] Project saved; preparation enqueue needs retry.");
    }
    redirect(`/projects/${projectId}/quick`);
  }
  redirect(`/projects/${projectId}/research`);
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
