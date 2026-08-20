import "server-only";

import { throwRepositoryError } from "@/lib/repositories/repository-error";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { AIUsage, AITaskRoute } from "@/lib/ai/types";
import type { GeneratedProtocol } from "@/lib/ai/schemas/protocol.schemas";
import type { Json, ProtocolRow, RubricDimensionRow, TestCaseRow } from "@/lib/types/database";

const protocolColumns = "id, project_id, research_run_id, version, title, goal, status, test_mode, rules, generation_model, generation_provider, generation_input_tokens, generation_output_tokens, generation_latency_ms, generation_estimated_cost, prompt_version, input_signature, created_at, updated_at, locked_at";
const testCaseColumns = "id, protocol_id, position, title, objective, prompt, input_description, input_artifacts, expected_output_types, evidence_requirements, observation_focus, execution_rules, created_at, updated_at";
const rubricColumns = "id, protocol_id, position, name, weight, description, scoring_standard, created_at, updated_at";

export type ProtocolTestCaseRow = TestCaseRow;

export type CreateProtocolRecord = {
  projectId: string;
  researchRunId: string;
  protocol: GeneratedProtocol;
  route: AITaskRoute;
  usage: AIUsage;
  inputSignature: string;
};

export const protocolsRepository = {
  async listByProject(projectId: string): Promise<ProtocolRow[]> {
    const { data, error } = await getSupabaseServerClient()
      .from("protocols")
      .select(protocolColumns)
      .eq("project_id", projectId)
      .order("version", { ascending: false });
    if (error) throwRepositoryError("protocols.listByProject", error);
    return data;
  },

  async listTestCases(protocolId: string): Promise<ProtocolTestCaseRow[]> {
    const { data, error } = await getSupabaseServerClient()
      .from("test_cases")
      .select(testCaseColumns)
      .eq("protocol_id", protocolId)
      .order("position", { ascending: true });
    if (error) throwRepositoryError("protocols.listTestCases", error);
    return data;
  },

  async listRubric(protocolId: string): Promise<RubricDimensionRow[]> {
    const { data, error } = await getSupabaseServerClient()
      .from("rubric_dimensions")
      .select(rubricColumns)
      .eq("protocol_id", protocolId)
      .order("position", { ascending: true });
    if (error) throwRepositoryError("protocols.listRubric", error);
    return data;
  },

  async createDraft(record: CreateProtocolRecord): Promise<string> {
    const { data, error } = await getSupabaseServerClient().rpc("create_protocol_draft", {
      p_project_id: record.projectId,
      p_research_run_id: record.researchRunId,
      p_protocol: record.protocol as unknown as Json,
      p_generation_provider: record.route.provider,
      p_generation_model: record.route.model,
      p_prompt_version: record.route.promptVersion,
      p_input_signature: record.inputSignature,
      p_usage: record.usage as unknown as Json,
    });
    if (error) throwRepositoryError("protocols.createDraft", error);
    return data;
  },

  async lock(protocolId: string): Promise<void> {
    const { error } = await getSupabaseServerClient().rpc("lock_protocol", { p_protocol_id: protocolId });
    if (error) throwRepositoryError("protocols.lock", error);
  },
};
