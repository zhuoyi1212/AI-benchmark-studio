import type { Database as GeneratedDatabase } from "@/lib/types/database.generated";
import type { AIProviderName } from "@/lib/ai/types";

/**
 * Domain-refined row types layered over the generated Supabase catalog.
 * The migration remains authoritative for database shape and constraints.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type ProjectStatus =
  | "draft"
  | "researching"
  | "research_ready"
  | "protocol_draft"
  | "protocol_locked"
  | "testing"
  | "reviewing"
  | "review_locked"
  | "completed"
  | "reported"
  | "published";
export type RunStatus = "pending" | "running" | "completed" | "failed";
export type ProtocolStatus = "draft" | "locked";
export type ReviewStatus = "reviewing" | "locked" | "revealed";
export type TestRunStatus = "pending" | "uploaded" | "invalid" | "ready_for_review";
export type HumanReviewAction = "override" | "revert";

export type ProjectRow = {
  id: string;
  owner_id: string | null;
  name: string;
  intent: string;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ProductRow = {
  id: string;
  created_by: string | null;
  name: string;
  normalized_name: string;
  official_url: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type ProjectProductRow = {
  project_id: string;
  product_id: string;
  display_order: number;
  submitted_name: string;
  submitted_official_url: string | null;
  created_at: string;
};

export type ResearchRunRow = {
  id: string;
  project_id: string;
  version: number;
  status: RunStatus;
  model: string | null;
  provider: AIProviderName | null;
  prompt_version: string | null;
  input_snapshot: Json;
  input_signature: string | null;
  comparability: Json | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  estimated_cost: number | null;
  search_provider: AIProviderName | null;
  search_model: string | null;
  search_prompt_version: string | null;
  comparability_provider: AIProviderName | null;
  comparability_model: string | null;
  comparability_prompt_version: string | null;
  comparability_input_tokens: number | null;
  comparability_output_tokens: number | null;
  comparability_latency_ms: number | null;
  comparability_estimated_cost: number | null;
};

export type ProductResearchRow = {
  id: string;
  project_id: string;
  research_run_id: string;
  product_id: string;
  positioning: string;
  target_users: Json;
  capabilities: Json;
  key_features: Json;
  pricing: Json | null;
  official_best_practices: Json;
  limitations: Json;
  sources: Json;
  created_at: string;
};

export type ProtocolRow = {
  id: string;
  project_id: string;
  research_run_id: string;
  version: number;
  title: string;
  goal: string;
  status: ProtocolStatus;
  test_mode: "standardized" | "best_practice" | "mixed";
  rules: Json;
  generation_model: string | null;
  generation_provider: AIProviderName | null;
  generation_input_tokens: number | null;
  generation_output_tokens: number | null;
  generation_latency_ms: number | null;
  generation_estimated_cost: number | null;
  prompt_version: string | null;
  input_signature: string | null;
  created_at: string;
  updated_at: string;
  locked_at: string | null;
};

export type TestCaseRow = {
  id: string;
  protocol_id: string;
  position: number;
  title: string;
  objective: string;
  prompt: string;
  input_description: string | null;
  input_artifacts: Json;
  expected_output_types: Json;
  evidence_requirements: Json;
  observation_focus: Json;
  execution_rules: Json;
  created_at: string;
  updated_at: string;
};

export type RubricDimensionRow = {
  id: string;
  protocol_id: string;
  position: number;
  name: string;
  weight: number;
  description: string | null;
  scoring_standard: Json;
  created_at: string;
  updated_at: string;
};

export type TestRunRow = {
  id: string;
  project_id: string;
  protocol_id: string;
  test_case_id: string;
  product_id: string;
  status: TestRunStatus;
  generation_time_seconds: number | null;
  retry_count: number;
  manually_edited: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type TestArtifactRow = {
  id: string;
  test_run_id: string;
  kind: "image" | "pdf" | "text" | "video";
  bucket_id: "benchmark-artifacts";
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  preview_path: string | null;
  sha256: string | null;
  metadata: Json;
  created_at: string;
};

export type BlindSampleRow = {
  id: string;
  protocol_id: string;
  label: string;
  created_at: string;
};

export type BlindMappingRow = {
  blind_sample_id: string;
  protocol_id: string;
  project_id: string;
  product_id: string;
  created_at: string;
};

export type JudgeRunRow = {
  id: string;
  project_id: string;
  protocol_id: string;
  attempt: number;
  status: RunStatus;
  model: string;
  prompt_version: string;
  input_snapshot: Json;
  input_signature: string;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type JudgeRunArtifactRow = {
  judge_run_id: string;
  artifact_id: string;
  created_at: string;
};

export type JudgeCaseRunRow = {
  id: string;
  judge_run_id: string;
  protocol_id: string;
  test_case_id: string;
  status: RunStatus;
  provider: AIProviderName;
  model: string;
  prompt_version: string;
  input_signature: string;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  estimated_cost: number | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type JudgeScoreRow = {
  id: string;
  judge_run_id: string;
  judge_case_run_id: string;
  protocol_id: string;
  test_case_id: string;
  blind_sample_id: string;
  rubric_dimension_id: string;
  ai_score: number;
  reason: string;
  evidence: Json;
  confidence: number;
  model: string;
  prompt_version: string;
  created_at: string;
};

export type ReviewSessionRow = {
  id: string;
  project_id: string;
  protocol_id: string;
  judge_run_id: string;
  status: ReviewStatus;
  locked_at: string | null;
  revealed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type HumanReviewEventRow = {
  id: string;
  event_sequence: number;
  score_revision: number;
  review_session_id: string;
  judge_score_id: string;
  action: HumanReviewAction;
  override_score: number | null;
  reason: string | null;
  target_event_id: string | null;
  actor_id: string | null;
  created_at: string;
};

export type ExperienceFindingRow = {
  id: string;
  project_id: string;
  protocol_id: string;
  version: number;
  status: RunStatus;
  input_snapshot: Json;
  input_signature: string;
  output: Json | null;
  human_output: Json | null;
  provider: AIProviderName | null;
  model: string | null;
  prompt_version: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  human_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  estimated_cost: number | null;
};

export type ResultAnalysisRow = {
  id: string;
  project_id: string;
  protocol_id: string;
  review_session_id: string;
  judge_run_id: string;
  attempt: number;
  status: RunStatus;
  final_score_signature: string;
  input_snapshot: Json;
  winner_product_id: string | null;
  output: Json | null;
  model: string | null;
  provider: AIProviderName | null;
  prompt_version: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  estimated_cost: number | null;
};

export type ReportRow = {
  id: string;
  project_id: string;
  result_analysis_id: string;
  version: number;
  status: RunStatus;
  content: Json | null;
  model: string | null;
  provider: AIProviderName | null;
  prompt_version: string | null;
  error_message: string | null;
  started_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  estimated_cost: number | null;
};

export type ReportArtifactRow = {
  report_id: string;
  artifact_id: string;
  evidence_role: "case_output" | "score_evidence" | "comparison";
  caption: string | null;
  created_at: string;
};

export type PublishPackRow = {
  id: string;
  project_id: string;
  report_id: string | null;
  findings_id: string | null;
  version: number;
  status: "draft" | "discovering" | "generating" | "ready" | "failed";
  config: Json;
  content_ideas: Json;
  selected_idea: Json | null;
  community_post: Json | null;
  model: string | null;
  provider: AIProviderName | null;
  prompt_version: string | null;
  input_signature: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  estimated_cost: number | null;
  discovery_provider: AIProviderName | null;
  discovery_model: string | null;
  discovery_prompt_version: string | null;
  discovery_input_signature: string | null;
  discovery_input_tokens: number | null;
  discovery_output_tokens: number | null;
  discovery_latency_ms: number | null;
  discovery_estimated_cost: number | null;
  discovery_started_at: string | null;
  discovered_at: string | null;
  generation_started_at: string | null;
};

export type PublishPackArtifactRow = {
  publish_pack_id: string;
  artifact_id: string;
  display_order: number;
  reason: string;
  supports_claim: string | null;
  supports_paragraph: number | null;
  created_at: string;
};

export type ReviewFinalScoreRow = {
  review_session_id: string;
  judge_score_id: string;
  test_case_id: string;
  blind_sample_id: string;
  rubric_dimension_id: string;
  ai_score: number;
  final_score: number;
  active_override_event_id: string | null;
};

export type DatabaseTableRows = {
  projects: ProjectRow;
  products: ProductRow;
  project_products: ProjectProductRow;
  research_runs: ResearchRunRow;
  product_research: ProductResearchRow;
  protocols: ProtocolRow;
  test_cases: TestCaseRow;
  rubric_dimensions: RubricDimensionRow;
  test_runs: TestRunRow;
  test_artifacts: TestArtifactRow;
  blind_samples: BlindSampleRow;
  blind_mappings: BlindMappingRow;
  judge_runs: JudgeRunRow;
  judge_case_runs: JudgeCaseRunRow;
  judge_run_artifacts: JudgeRunArtifactRow;
  judge_scores: JudgeScoreRow;
  review_sessions: ReviewSessionRow;
  human_review_events: HumanReviewEventRow;
  experience_findings: ExperienceFindingRow;
  result_analyses: ResultAnalysisRow;
  reports: ReportRow;
  report_artifacts: ReportArtifactRow;
  publish_packs: PublishPackRow;
  publish_pack_artifacts: PublishPackArtifactRow;
};

export type DatabaseTableName = keyof DatabaseTableRows;
export type TableRow<Table extends DatabaseTableName> = DatabaseTableRows[Table];

type GeneratedPublic = GeneratedDatabase["public"];
type GeneratedTables = GeneratedPublic["Tables"];

type PublicTables = {
  [Table in keyof GeneratedTables]: Omit<GeneratedTables[Table], "Row"> & {
    Row: Table extends DatabaseTableName ? DatabaseTableRows[Table] : never;
  };
};

/**
 * Supabase's generated Insert, Update, relationship, and internal metadata are
 * preserved. Rows use narrower domain unions where Postgres check constraints
 * are more precise than the generator's plain string output.
 */
export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<GeneratedPublic, "Tables" | "Views"> & {
    Tables: PublicTables;
    Views: Omit<GeneratedPublic["Views"], "review_final_scores"> & {
      review_final_scores: {
        Row: ReviewFinalScoreRow;
        Relationships: [];
      };
    };
  };
};
