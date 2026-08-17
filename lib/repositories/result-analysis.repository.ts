import "server-only";

import type { GeneratedResultAnalysis } from "@/lib/ai/schemas/result-analysis.schemas";
import type { AITaskRoute, AIUsage } from "@/lib/ai/types";
import { throwRepositoryError } from "@/lib/repositories/repository-error";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Json, ResultAnalysisRow } from "@/lib/types/database";

const analysisColumns = "id, project_id, protocol_id, review_session_id, judge_run_id, attempt, status, final_score_signature, input_snapshot, winner_product_id, output, model, provider, prompt_version, error_message, started_at, completed_at, created_at, updated_at, input_tokens, output_tokens, latency_ms, estimated_cost";

export const resultAnalysisRepository = {
  async begin(projectId: string, reviewSessionId: string): Promise<string> {
    const { data, error } = await getSupabaseServerClient().rpc("begin_result_analysis", {
      p_project_id: projectId,
      p_review_session_id: reviewSessionId,
    });
    if (error) throwRepositoryError("resultAnalysis.begin", error);
    return data;
  },

  async start(resultAnalysisId: string, route: AITaskRoute): Promise<void> {
    const { error } = await getSupabaseServerClient().rpc("start_result_analysis", {
      p_result_analysis_id: resultAnalysisId,
      p_provider: route.provider,
      p_model: route.model,
      p_prompt_version: route.promptVersion,
    });
    if (error) throwRepositoryError("resultAnalysis.start", error);
  },

  async complete(resultAnalysisId: string, winnerProductId: string, output: GeneratedResultAnalysis, usage: AIUsage): Promise<void> {
    const { error } = await getSupabaseServerClient().rpc("complete_result_analysis", {
      p_result_analysis_id: resultAnalysisId,
      p_winner_product_id: winnerProductId,
      p_output: output as unknown as Json,
      p_usage: usage as unknown as Json,
    });
    if (error) throwRepositoryError("resultAnalysis.complete", error);
  },

  async fail(resultAnalysisId: string, errorMessage: string): Promise<void> {
    const { error } = await getSupabaseServerClient().rpc("fail_result_analysis", {
      p_result_analysis_id: resultAnalysisId,
      p_error_message: errorMessage,
    });
    if (error) throwRepositoryError("resultAnalysis.fail", error);
  },

  async listByReview(reviewSessionId: string): Promise<ResultAnalysisRow[]> {
    const { data, error } = await getSupabaseServerClient()
      .from("result_analyses")
      .select(analysisColumns)
      .eq("review_session_id", reviewSessionId)
      .order("attempt", { ascending: false });
    if (error) throwRepositoryError("resultAnalysis.listByReview", error);
    return data;
  },
};
