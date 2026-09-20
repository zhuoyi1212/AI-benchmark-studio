import "server-only";

import { throwRepositoryError } from "@/lib/repositories/repository-error";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { JudgeCaseScoreOutput } from "@/lib/ai/schemas/judge.schemas";
import type { AIUsage, AITaskRoute } from "@/lib/ai/types";
import type { Database, Json, JudgeCaseRunRow, JudgeRunRow, JudgeScoreRow } from "@/lib/types/database";

const artifactBucket = "benchmark-artifacts";
const judgeRunColumns = "id, project_id, protocol_id, attempt, status, model, prompt_version, input_snapshot, input_signature, error_message, started_at, completed_at, created_at, updated_at";
const judgeCaseRunColumns = "id, judge_run_id, protocol_id, test_case_id, status, provider, model, prompt_version, input_signature, input_tokens, output_tokens, latency_ms, estimated_cost, error_message, started_at, completed_at, created_at, updated_at";
const judgeScoreColumns = "id, judge_run_id, judge_case_run_id, protocol_id, test_case_id, blind_sample_id, rubric_dimension_id, ai_score, reason, evidence, confidence, model, prompt_version, created_at";

export type JudgeCaseInputRow = Database["public"]["Functions"]["get_judge_case_inputs"]["Returns"][number];

export const judgeRepository = {
  async begin(projectId: string, protocolId: string): Promise<string> {
    const { data, error } = await getSupabaseServerClient().rpc("begin_judge_run", {
      p_project_id: projectId,
      p_protocol_id: protocolId,
    });
    if (error) throwRepositoryError("judge.begin", error);
    return data;
  },

  async beginCase(judgeRunId: string, testCaseId: string, route: AITaskRoute, inputSignature: string): Promise<string> {
    const { data, error } = await getSupabaseServerClient().rpc("begin_judge_case_run", {
      p_judge_run_id: judgeRunId,
      p_test_case_id: testCaseId,
      p_provider: route.provider,
      p_model: route.model,
      p_prompt_version: route.promptVersion,
      p_input_signature: inputSignature,
    });
    if (error) throwRepositoryError("judge.beginCase", error);
    return data;
  },

  async listCaseInputs(judgeRunId: string, testCaseId: string): Promise<JudgeCaseInputRow[]> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const { data, error } = await getSupabaseServerClient().rpc("get_judge_case_inputs", {
        p_judge_run_id: judgeRunId,
        p_test_case_id: testCaseId,
      });
      if (!error) return data;
      console.error("[JudgeInputReadError]", { attempt, code: error.code, message: error.message });
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      else throwRepositoryError("judge.listCaseInputs", error);
    }
    throw new Error("Unreachable Judge input read state");
  },

  async createSignedArtifactUrl(storagePath: string): Promise<string> {
    const { data, error } = await getSupabaseServerClient().storage.from(artifactBucket).createSignedUrl(storagePath, 1800);
    if (error) throwRepositoryError("judge.createSignedArtifactUrl", error);
    return data.signedUrl;
  },

  async completeCase(judgeCaseRunId: string, scores: JudgeCaseScoreOutput[], usage: AIUsage): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const { error } = await getSupabaseServerClient().rpc("complete_judge_case_run", {
        p_judge_case_run_id: judgeCaseRunId,
        p_scores: scores as unknown as Json,
        p_usage: usage as unknown as Json,
      });
      if (!error) return;
      console.error("[JudgePersistenceError]", { attempt, code: error.code, message: error.message, details: error.details, hint: error.hint });

      const { data: persisted, error: readError } = await getSupabaseServerClient()
        .from("judge_case_runs")
        .select("status")
        .eq("id", judgeCaseRunId)
        .maybeSingle();
      if (!readError && persisted?.status === "completed") return;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 750));
      else throwRepositoryError("judge.completeCase", error);
    }
  },

  async complete(judgeRunId: string): Promise<void> {
    const { error } = await getSupabaseServerClient().rpc("complete_judge_run", { p_judge_run_id: judgeRunId });
    if (error) throwRepositoryError("judge.complete", error);
  },

  async fail(judgeRunId: string, errorMessage: string): Promise<void> {
    const { error } = await getSupabaseServerClient().rpc("fail_judge_run", {
      p_judge_run_id: judgeRunId,
      p_error_message: errorMessage,
    });
    if (error) throwRepositoryError("judge.fail", error);
  },

  async listRuns(protocolId: string): Promise<JudgeRunRow[]> {
    const { data, error } = await getSupabaseServerClient()
      .from("judge_runs")
      .select(judgeRunColumns)
      .eq("protocol_id", protocolId)
      .order("attempt", { ascending: false });
    if (error) throwRepositoryError("judge.listRuns", error);
    return data;
  },

  async listCaseRuns(judgeRunId: string): Promise<JudgeCaseRunRow[]> {
    const { data, error } = await getSupabaseServerClient()
      .from("judge_case_runs")
      .select(judgeCaseRunColumns)
      .eq("judge_run_id", judgeRunId)
      .order("created_at", { ascending: true });
    if (error) throwRepositoryError("judge.listCaseRuns", error);
    return data;
  },

  async listScores(judgeRunId: string): Promise<JudgeScoreRow[]> {
    const { data, error } = await getSupabaseServerClient()
      .from("judge_scores")
      .select(judgeScoreColumns)
      .eq("judge_run_id", judgeRunId)
      .order("created_at", { ascending: true });
    if (error) throwRepositoryError("judge.listScores", error);
    return data;
  },
};
