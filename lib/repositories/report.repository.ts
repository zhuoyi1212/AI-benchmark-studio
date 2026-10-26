import "server-only";

import type { GeneratedReport } from "@/lib/ai/schemas/report.schemas";
import type { AITaskRoute, AIUsage } from "@/lib/ai/types";
import { throwRepositoryError } from "@/lib/repositories/repository-error";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Json, ProductResearchRow, ReportArtifactRow, ReportRow, TestArtifactRow } from "@/lib/types/database";

const reportColumns = "id, project_id, result_analysis_id, version, status, content, model, provider, prompt_version, error_message, started_at, completed_at, created_at, updated_at, input_tokens, output_tokens, latency_ms, estimated_cost";
const reportArtifactColumns = "report_id, artifact_id, evidence_role, caption, created_at";
const testArtifactColumns = "id, test_run_id, kind, bucket_id, storage_path, file_name, mime_type, size_bytes, preview_path, sha256, metadata, created_at";

export const reportRepository = {
  async begin(projectId: string, resultAnalysisId: string): Promise<string> {
    const { data, error } = await getSupabaseServerClient().rpc("begin_report", {
      p_project_id: projectId,
      p_result_analysis_id: resultAnalysisId,
    });
    if (error) throwRepositoryError("report.begin", error);
    return data;
  },

  async start(reportId: string, route: AITaskRoute): Promise<void> {
    const { error } = await getSupabaseServerClient().rpc("start_report", {
      p_report_id: reportId,
      p_provider: route.provider,
      p_model: route.model,
      p_prompt_version: route.promptVersion,
    });
    if (error) throwRepositoryError("report.start", error);
  },

  async complete(reportId: string, content: GeneratedReport, usage: AIUsage): Promise<void> {
    const { error } = await getSupabaseServerClient().rpc("complete_report", {
      p_report_id: reportId,
      p_content: content as unknown as Json,
      p_usage: usage as unknown as Json,
    });
    if (error) throwRepositoryError("report.complete", error);
  },

  async fail(reportId: string, errorMessage: string): Promise<void> {
    const { error } = await getSupabaseServerClient().rpc("fail_report", {
      p_report_id: reportId,
      p_error_message: errorMessage,
    });
    if (error) throwRepositoryError("report.fail", error);
  },

  async listByAnalysis(resultAnalysisId: string, limit?: number): Promise<ReportRow[]> {
    const query = getSupabaseServerClient()
      .from("reports")
      .select(reportColumns)
      .eq("result_analysis_id", resultAnalysisId)
      .order("version", { ascending: false });
    const { data, error } = await (limit === undefined ? query : query.limit(limit));
    if (error) throwRepositoryError("report.listByAnalysis", error);
    return data;
  },

  async listResearchForProtocol(protocolId: string): Promise<ProductResearchRow[]> {
    const client = getSupabaseServerClient();
    const { data: protocol, error: protocolError } = await client
      .from("protocols")
      .select("research_run_id")
      .eq("id", protocolId)
      .single();
    if (protocolError) throwRepositoryError("report.getProtocolResearch", protocolError);
    const { data, error } = await client
      .from("product_research")
      .select("id, project_id, research_run_id, product_id, positioning, target_users, capabilities, key_features, pricing, official_best_practices, limitations, input_formats, output_formats, sources, snapshot_id, reused_from_snapshot, created_at")
      .eq("research_run_id", protocol.research_run_id)
      .order("created_at", { ascending: true });
    if (error) throwRepositoryError("report.listResearch", error);
    return data;
  },

  async listArtifactLinks(reportId: string): Promise<ReportArtifactRow[]> {
    const { data, error } = await getSupabaseServerClient()
      .from("report_artifacts")
      .select(reportArtifactColumns)
      .eq("report_id", reportId)
      .order("created_at", { ascending: true });
    if (error) throwRepositoryError("report.listArtifactLinks", error);
    return data;
  },

  async listArtifacts(artifactIds: string[]): Promise<TestArtifactRow[]> {
    if (artifactIds.length === 0) return [];
    const { data, error } = await getSupabaseServerClient()
      .from("available_test_artifacts")
      .select(testArtifactColumns)
      .in("id", artifactIds)
      .order("created_at", { ascending: true });
    if (error) throwRepositoryError("report.listArtifacts", error);
    return data;
  },
};
