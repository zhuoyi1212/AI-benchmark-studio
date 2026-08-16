import "server-only";

import { throwRepositoryError } from "@/lib/repositories/repository-error";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ProjectRow, TestRunRow } from "@/lib/types/database";

const projectListColumns = "id, owner_id, name, intent, status, created_at, updated_at, deleted_at";
const progressColumns = "id, project_id, status";

export type ProjectProgressRow = Pick<TestRunRow, "id" | "project_id" | "status">;

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
