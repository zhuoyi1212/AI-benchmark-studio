import "server-only";

import { throwRepositoryError } from "@/lib/repositories/repository-error";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Json, ProjectProductRow, ProjectRow, TestRunRow } from "@/lib/types/database";

const projectListColumns = "id, owner_id, name, intent, status, created_at, updated_at, deleted_at";
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
  products: Array<{ name: string; officialUrl: string | null }>;
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
      ...(record.ownerId ? { p_owner_id: record.ownerId } : {}),
    });
    if (error) throwRepositoryError("projects.create", error);
    return data;
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
