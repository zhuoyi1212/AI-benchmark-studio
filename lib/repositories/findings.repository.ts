import "server-only";

import type { ConfirmedFindingsOutput, ExperienceFindingsOutput } from "@/lib/ai/schemas/findings.schemas";
import type { AITaskRoute, AIUsage } from "@/lib/ai/types";
import { throwRepositoryError } from "@/lib/repositories/repository-error";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ExperienceFindingRow, FindingRevisionRow, Json } from "@/lib/types/database";

const columns = "id, project_id, protocol_id, version, status, input_snapshot, input_signature, output, human_output, provider, model, prompt_version, error_message, started_at, completed_at, human_confirmed_at, created_at, updated_at, input_tokens, output_tokens, latency_ms, estimated_cost";

export const findingsRepository = {
  async listRevisions(findingsId: string): Promise<FindingRevisionRow[]> {
    const { data, error } = await getSupabaseServerClient().from("experience_finding_revisions")
      .select("id,findings_id,version,kind,editor_kind,reason,output,provenance,created_at")
      .eq("findings_id", findingsId).order("version", { ascending: false });
    if (error) throwRepositoryError("findings.listRevisions", error);
    return data;
  },

  async begin(projectId: string, protocolId: string, inputSnapshot: Json, inputSignature: string): Promise<string> {
    const { data, error } = await getSupabaseServerClient().rpc("begin_experience_findings", {
      p_project_id: projectId,
      p_protocol_id: protocolId,
      p_input_snapshot: inputSnapshot,
      p_input_signature: inputSignature,
    });
    if (error) throwRepositoryError("findings.begin", error);
    return data;
  },

  async list(projectId: string, protocolId?: string): Promise<ExperienceFindingRow[]> {
    let query = getSupabaseServerClient()
      .from("experience_findings")
      .select(columns)
      .eq("project_id", projectId)
      .order("version", { ascending: false });
    if (protocolId) query = query.eq("protocol_id", protocolId);
    const { data, error } = await query;
    if (error) throwRepositoryError("findings.list", error);
    return data;
  },

  async start(findingsId: string, route: AITaskRoute): Promise<void> {
    const { error } = await getSupabaseServerClient().rpc("start_experience_findings", {
      p_findings_id: findingsId,
      p_provider: route.provider,
      p_model: route.model,
      p_prompt_version: route.promptVersion,
    });
    if (error) throwRepositoryError("findings.start", error);
  },

  async complete(findingsId: string, output: ExperienceFindingsOutput, usage: AIUsage): Promise<void> {
    const { error } = await getSupabaseServerClient().rpc("complete_experience_findings", {
      p_findings_id: findingsId,
      p_output: output as unknown as Json,
      p_usage: usage as unknown as Json,
    });
    if (error) throwRepositoryError("findings.complete", error);
  },

  async confirm(findingsId: string, output: ConfirmedFindingsOutput): Promise<void> {
    const { error } = await getSupabaseServerClient().rpc("confirm_experience_findings", {
      p_findings_id: findingsId,
      p_human_output: output as unknown as Json,
    });
    if (error) throwRepositoryError("findings.confirm", error);
  },

  async fail(findingsId: string, errorMessage: string): Promise<void> {
    const { error } = await getSupabaseServerClient().rpc("fail_experience_findings", {
      p_findings_id: findingsId,
      p_error_message: errorMessage,
    });
    if (error) throwRepositoryError("findings.fail", error);
  },
};
