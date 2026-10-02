import "server-only";

import { throwRepositoryError } from "@/lib/repositories/repository-error";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Json, ProjectProductRow, ProjectRow, TestRunRow } from "@/lib/types/database";
import type { EvaluationMode } from "@/lib/project-mode";

const projectListColumns = "id, owner_id, name, intent, status, evaluation_mode, quick_preparation_status, quick_preparation_error, created_at, updated_at, deleted_at";
const progressColumns = "id, project_id, status";
const projectProductColumns = "project_id, product_id, display_order, submitted_name, submitted_official_url";

export type ProjectProgressRow = Pick<TestRunRow, "id" | "project_id" | "status">;
export type ProjectProductListRow = Pick<
  ProjectProductRow,
  "project_id" | "product_id" | "display_order" | "submitted_name" | "submitted_official_url"
>;

export type CreateProjectRecord = {
  name: string;
  intent: string;
  products: Array<{ productId?: string; name: string; officialUrl: string | null }>;
  evaluationMode?: EvaluationMode;
  ownerId?: string | null;
};

export const projectsRepository = {
  async listActive(): Promise<ProjectRow[]> {
    const { data, error } = await getSupabaseServerClient()
      .from("projects")
      .select(projectListColumns)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    if (error) throwRepositoryError("projects.listActive", error);
    return data;
  },

  async findActiveById(projectId: string): Promise<ProjectRow | null> {
    const { data, error } = await getSupabaseServerClient()
      .from("projects")
      .select(projectListColumns)
      .eq("id", projectId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throwRepositoryError("projects.findActiveById", error);
    return data;
  },

  async create(record: CreateProjectRecord): Promise<string> {
    const { data, error } = await getSupabaseServerClient().rpc("create_benchmark_project", {
      p_name: record.name,
      p_intent: record.intent,
      p_products: record.products as Json,
      p_evaluation_mode: record.evaluationMode ?? "quick",
      ...(record.ownerId ? { p_owner_id: record.ownerId } : {}),
    });
    if (error) throwRepositoryError("projects.create", error);
    return data;
  },

  async setEvaluationMode(projectId: string, evaluationMode: EvaluationMode): Promise<void> {
    const { error } = await getSupabaseServerClient().rpc("set_project_evaluation_mode", {
      p_project_id: projectId,
      p_evaluation_mode: evaluationMode,
    });
    if (error) throwRepositoryError("projects.setEvaluationMode", error);
  },

  async setQuickPreparation(projectId: string, status: ProjectRow["quick_preparation_status"], errorMessage: string | null): Promise<void> {
    const { error } = await getSupabaseServerClient()
      .from("projects")
      .update({ quick_preparation_status: status, quick_preparation_error: errorMessage, updated_at: new Date().toISOString() })
      .eq("id", projectId)
      .is("deleted_at", null);
    if (error) throwRepositoryError("projects.setQuickPreparation", error);
  },

  async softDelete(projectId: string): Promise<boolean> {
    const now = new Date().toISOString();
    const { data, error } = await getSupabaseServerClient()
      .from("projects")
      .update({ deleted_at: now, updated_at: now })
      .eq("id", projectId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error) throwRepositoryError("projects.softDelete", error);
    return Boolean(data);
  },

  async listProductRows(projectIds: string[]): Promise<ProjectProductListRow[]> {
    if (projectIds.length === 0) return [];
    const { data, error } = await getSupabaseServerClient()
      .from("project_products")
      .select(projectProductColumns)
      .in("project_id", projectIds)
      .order("display_order", { ascending: true });
    if (error) throwRepositoryError("projects.listProductRows", error);
    return data;
  },

  async listProgressRows(projectIds: string[]): Promise<ProjectProgressRow[]> {
    if (projectIds.length === 0) return [];
    const { data, error } = await getSupabaseServerClient()
      .from("test_runs")
      .select(progressColumns)
      .in("project_id", projectIds);
    if (error) throwRepositoryError("projects.listProgressRows", error);
    return data;
  },
};
