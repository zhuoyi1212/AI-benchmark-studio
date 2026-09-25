import "server-only";

import { throwRepositoryError } from "@/lib/repositories/repository-error";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { AIProviderName, AIUsage, AITaskRoute } from "@/lib/ai/types";
import type { ComparabilityResult } from "@/lib/types/research";
import type { Json, ProductResearchRow, ProductResearchSnapshotRow, ResearchRunRow } from "@/lib/types/database";

const researchRunColumns = "id, project_id, version, status, model, provider, prompt_version, input_snapshot, input_signature, comparability, error_message, started_at, completed_at, created_at, updated_at, input_tokens, output_tokens, latency_ms, estimated_cost, search_provider, search_model, search_prompt_version, comparability_provider, comparability_model, comparability_prompt_version, comparability_input_tokens, comparability_output_tokens, comparability_latency_ms, comparability_estimated_cost, reuse_details";
const productResearchColumns = "id, project_id, research_run_id, product_id, positioning, target_users, capabilities, key_features, pricing, official_best_practices, limitations, input_formats, output_formats, sources, snapshot_id, reused_from_snapshot, created_at";
const snapshotColumns = "id, product_id, version, origin_project_id, origin_research_run_id, origin_product_research_id, positioning, target_users, capabilities, key_features, pricing, official_best_practices, limitations, input_formats, output_formats, sources, search_provider, search_model, search_prompt_version, synthesis_provider, synthesis_model, synthesis_prompt_version, input_signature, researched_at, valid_until, created_at";

export type ProductResearchWrite = Omit<ProductResearchRow, "id" | "created_at">;

type RouteIdentity = {
  provider: AIProviderName;
  model: string;
  promptVersion: string;
};

export type CompleteResearchRunRecord = {
  researchRunId: string;
  searchRoute: RouteIdentity;
  synthesisRoute: RouteIdentity;
  synthesisUsage: AIUsage;
  comparabilityRoute: AITaskRoute;
  comparabilityUsage: AIUsage;
  comparability: ComparabilityResult;
};

export const researchRepository = {
  async begin(projectId: string, inputSnapshot: Json, inputSignature: string): Promise<string> {
    const { data, error } = await getSupabaseServerClient().rpc("begin_product_research", {
      p_project_id: projectId,
      p_input_snapshot: inputSnapshot,
      p_input_signature: inputSignature,
    });
    if (error) throwRepositoryError("research.begin", error);
    return data;
  },

  async listRuns(projectId: string): Promise<ResearchRunRow[]> {
    const { data, error } = await getSupabaseServerClient()
      .from("research_runs")
      .select(researchRunColumns)
      .eq("project_id", projectId)
      .order("version", { ascending: false });
    if (error) throwRepositoryError("research.listRuns", error);
    return data;
  },

  async listProductResearch(researchRunId: string): Promise<ProductResearchRow[]> {
    const { data, error } = await getSupabaseServerClient()
      .from("product_research")
      .select(productResearchColumns)
      .eq("research_run_id", researchRunId);
    if (error) throwRepositoryError("research.listProductResearch", error);
    return data;
  },

  async listLatestSnapshots(productIds: string[]): Promise<ProductResearchSnapshotRow[]> {
    if (productIds.length === 0) return [];
    const { data, error } = await getSupabaseServerClient()
      .from("product_research_snapshots")
      .select(snapshotColumns)
      .in("product_id", productIds)
      .order("version", { ascending: false });
    if (error) throwRepositoryError("research.listLatestSnapshots", error);
    const latest = new Map<string, ProductResearchSnapshotRow>();
    for (const snapshot of data) {
      if (!latest.has(snapshot.product_id)) latest.set(snapshot.product_id, snapshot);
    }
    return [...latest.values()];
  },

  async listSnapshotsByIds(snapshotIds: string[]): Promise<ProductResearchSnapshotRow[]> {
    if (snapshotIds.length === 0) return [];
    const { data, error } = await getSupabaseServerClient()
      .from("product_research_snapshots")
      .select(snapshotColumns)
      .in("id", snapshotIds);
    if (error) throwRepositoryError("research.listSnapshotsByIds", error);
    return data;
  },

  async recordReuseDetails(researchRunId: string, details: Json): Promise<void> {
    const { error } = await getSupabaseServerClient()
      .from("research_runs")
      .update({ reuse_details: details })
      .eq("id", researchRunId)
      .eq("status", "running");
    if (error) throwRepositoryError("research.recordReuseDetails", error);
  },

  async insertProductResearch(records: ProductResearchWrite[]): Promise<void> {
    const { error } = await getSupabaseServerClient().from("product_research").insert(records);
    if (error) throwRepositoryError("research.insertProductResearch", error);
  },

  async complete(record: CompleteResearchRunRecord): Promise<void> {
    const { error } = await getSupabaseServerClient().rpc("complete_product_research", {
      p_research_run_id: record.researchRunId,
      p_search_provider: record.searchRoute.provider,
      p_search_model: record.searchRoute.model,
      p_search_prompt_version: record.searchRoute.promptVersion,
      p_synthesis_provider: record.synthesisRoute.provider,
      p_synthesis_model: record.synthesisRoute.model,
      p_synthesis_prompt_version: record.synthesisRoute.promptVersion,
      p_synthesis_usage: record.synthesisUsage as unknown as Json,
      p_comparability_provider: record.comparabilityRoute.provider,
      p_comparability_model: record.comparabilityRoute.model,
      p_comparability_prompt_version: record.comparabilityRoute.promptVersion,
      p_comparability_usage: record.comparabilityUsage as unknown as Json,
      p_comparability: record.comparability as Json,
    });
    if (error) throwRepositoryError("research.complete", error);
  },

  async fail(researchRunId: string, errorMessage: string): Promise<void> {
    const { error } = await getSupabaseServerClient().rpc("fail_product_research", {
      p_research_run_id: researchRunId,
      p_error_message: errorMessage,
    });
    if (error) throwRepositoryError("research.fail", error);
  },
};
