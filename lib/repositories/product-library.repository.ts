import "server-only";

import { throwRepositoryError } from "@/lib/repositories/repository-error";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ProductResearchSnapshotRow, ProductRow, ProjectProductRow, ProjectRow } from "@/lib/types/database";

const productColumns = "id, created_by, name, normalized_name, official_url, logo_url, created_at, updated_at, archived_at";
const snapshotColumns = "id, product_id, version, origin_project_id, origin_research_run_id, origin_product_research_id, positioning, target_users, capabilities, key_features, pricing, official_best_practices, limitations, input_formats, output_formats, sources, search_provider, search_model, search_prompt_version, synthesis_provider, synthesis_model, synthesis_prompt_version, input_signature, researched_at, valid_until, created_at";
const projectProductColumns = "project_id, product_id, display_order, submitted_name, submitted_official_url, created_at";
const projectColumns = "id, owner_id, name, intent, status, evaluation_mode, quick_preparation_status, quick_preparation_error, created_at, updated_at, deleted_at";

export const productLibraryRepository = {
  async setArchived(productId: string, archived: boolean): Promise<boolean> {
    let query = getSupabaseServerClient().from("products")
      .update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", productId);
    query = archived ? query.is("archived_at", null) : query.not("archived_at", "is", null);
    const { data, error } = await query.select("id").maybeSingle();
    if (error) throwRepositoryError("productLibrary.setArchived", error);
    return data !== null;
  },
  async listTestedProducts(productIds: string[]) {
    if (productIds.length === 0) return [];
    const { data, error } = await getSupabaseServerClient().from("test_runs")
      .select("product_id,project_id,available_test_artifacts!inner(id)")
      .in("product_id", productIds).neq("status", "invalid").gt("available_test_artifacts.size_bytes", 0);
    if (error) throwRepositoryError("productLibrary.listTestedProducts", error);
    return data.map(run => ({ productId: run.product_id, projectId: run.project_id }));
  },
  async listOutputs(projectIds: string[]) {
    if (projectIds.length === 0) return { reports: [], articles: [] };
    const client = getSupabaseServerClient();
    const [reports, articles] = await Promise.all([
      client.from("reports").select("id,project_id,version,created_at").in("project_id", projectIds).eq("status", "completed").order("created_at", { ascending: false }),
      client.from("publish_packs").select("id,project_id,version,created_at").in("project_id", projectIds).eq("status", "ready").order("created_at", { ascending: false }),
    ]);
    if (reports.error) throwRepositoryError("productLibrary.reports", reports.error);
    if (articles.error) throwRepositoryError("productLibrary.articles", articles.error);
    return { reports: reports.data, articles: articles.data };
  },
  async listProducts(productId?: string, archived = false): Promise<ProductRow[]> {
    let query = getSupabaseServerClient().from("products").select(productColumns);
    query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
    if (productId) query = query.eq("id", productId);
    const { data, error } = await query.order("updated_at", { ascending: false });
    if (error) throwRepositoryError("productLibrary.listProducts", error);
    return data;
  },

  async listSnapshots(productIds: string[]): Promise<ProductResearchSnapshotRow[]> {
    if (productIds.length === 0) return [];
    const { data, error } = await getSupabaseServerClient().from("product_research_snapshots").select(snapshotColumns).in("product_id", productIds).order("version", { ascending: false });
    if (error) throwRepositoryError("productLibrary.listSnapshots", error);
    return data;
  },

  async listProjectProducts(productIds: string[]): Promise<ProjectProductRow[]> {
    if (productIds.length === 0) return [];
    const { data, error } = await getSupabaseServerClient().from("project_products").select(projectProductColumns).in("product_id", productIds).order("created_at", { ascending: false });
    if (error) throwRepositoryError("productLibrary.listProjectProducts", error);
    return data;
  },

  async listProjects(projectIds: string[]): Promise<ProjectRow[]> {
    if (projectIds.length === 0) return [];
    const { data, error } = await getSupabaseServerClient().from("projects").select(projectColumns).in("id", projectIds).is("deleted_at", null).order("created_at", { ascending: false });
    if (error) throwRepositoryError("productLibrary.listProjects", error);
    return data;
  },
};
