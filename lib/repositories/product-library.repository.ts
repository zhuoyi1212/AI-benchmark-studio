import "server-only";

import { throwRepositoryError } from "@/lib/repositories/repository-error";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ProductResearchSnapshotRow, ProductRow, ProjectProductRow, ProjectRow } from "@/lib/types/database";

const productColumns = "id, created_by, name, normalized_name, official_url, logo_url, created_at, updated_at, archived_at";
const snapshotColumns = "id, product_id, version, origin_project_id, origin_research_run_id, origin_product_research_id, positioning, target_users, capabilities, key_features, pricing, official_best_practices, limitations, input_formats, output_formats, sources, search_provider, search_model, search_prompt_version, synthesis_provider, synthesis_model, synthesis_prompt_version, input_signature, researched_at, valid_until, created_at";
const projectProductColumns = "project_id, product_id, display_order, submitted_name, submitted_official_url, created_at";
const projectColumns = "id, owner_id, name, intent, status, evaluation_mode, quick_preparation_status, quick_preparation_error, created_at, updated_at, deleted_at";

export const productLibraryRepository = {
  async listProducts(): Promise<ProductRow[]> {
    const { data, error } = await getSupabaseServerClient().from("products").select(productColumns).is("archived_at", null).order("updated_at", { ascending: false });
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
    const { data, error } = await getSupabaseServerClient().from("projects").select(projectColumns).in("id", projectIds);
    if (error) throwRepositoryError("productLibrary.listProjects", error);
    return data;
  },
};
