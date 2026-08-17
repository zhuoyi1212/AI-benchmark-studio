import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../supabase/migrations/202608170001_initial_benchmark_schema.sql", import.meta.url);
const sql = await readFile(migrationUrl, "utf8");
const providerMigrationUrl = new URL("../supabase/migrations/202608170002_ai_provider_metadata.sql", import.meta.url);
const providerSql = await readFile(providerMigrationUrl, "utf8");
const judgeHardeningUrl = new URL("../supabase/migrations/202608170003_harden_judge_case_runs.sql", import.meta.url);
const judgeHardeningSql = await readFile(judgeHardeningUrl, "utf8");
const projectCreationUrl = new URL("../supabase/migrations/202608170004_create_project_transaction.sql", import.meta.url);
const projectCreationSql = await readFile(projectCreationUrl, "utf8");
const researchLifecycleUrl = new URL("../supabase/migrations/202608170005_research_run_lifecycle.sql", import.meta.url);
const researchLifecycleSql = await readFile(researchLifecycleUrl, "utf8");
const neutralResearchUrl = new URL("../supabase/migrations/202608170006_provider_neutral_research_completion.sql", import.meta.url);
const neutralResearchSql = await readFile(neutralResearchUrl, "utf8");
const protocolLifecycleUrl = new URL("../supabase/migrations/202608170007_protocol_lifecycle.sql", import.meta.url);
const protocolLifecycleSql = await readFile(protocolLifecycleUrl, "utf8");
const testExecutionLifecycleUrl = new URL("../supabase/migrations/202608170008_test_execution_lifecycle.sql", import.meta.url);
const testExecutionLifecycleSql = await readFile(testExecutionLifecycleUrl, "utf8");
const blindLayerLifecycleUrl = new URL("../supabase/migrations/202608170009_blind_layer_lifecycle.sql", import.meta.url);
const blindLayerLifecycleSql = await readFile(blindLayerLifecycleUrl, "utf8");
const judgeLifecycleUrl = new URL("../supabase/migrations/202608170010_judge_lifecycle.sql", import.meta.url);
const judgeLifecycleSql = await readFile(judgeLifecycleUrl, "utf8");
const blindIdentityGuardUrl = new URL("../supabase/migrations/202608170011_blind_protocol_identity_guard.sql", import.meta.url);
const blindIdentityGuardSql = await readFile(blindIdentityGuardUrl, "utf8");
const humanReviewLifecycleUrl = new URL("../supabase/migrations/202608170012_human_review_lifecycle.sql", import.meta.url);
const humanReviewLifecycleSql = await readFile(humanReviewLifecycleUrl, "utf8");
const resultAnalysisLifecycleUrl = new URL("../supabase/migrations/202608170013_result_analysis_lifecycle.sql", import.meta.url);
const resultAnalysisLifecycleSql = await readFile(resultAnalysisLifecycleUrl, "utf8");

const coreTables = [
  "projects",
  "products",
  "project_products",
  "research_runs",
  "product_research",
  "protocols",
  "test_cases",
  "rubric_dimensions",
  "test_runs",
  "test_artifacts",
  "blind_samples",
  "blind_mappings",
  "judge_runs",
  "judge_scores",
  "review_sessions",
  "human_review_events",
  "result_analyses",
  "reports",
  "publish_packs",
];

test("defines every required M1 table", () => {
  for (const table of coreTables) {
    assert.match(sql, new RegExp(`create table public\\.${table} \\(`));
  }
  assert.match(sql, /create table public\.judge_run_artifacts \(/);
  assert.match(sql, /create table public\.report_artifacts \(/);
  assert.match(sql, /create table public\.publish_pack_artifacts \(/);
});

test("protects history without broad cascade deletion", () => {
  assert.doesNotMatch(sql, /on delete cascade/i);
  assert.match(sql, /projects[\s\S]*deleted_at timestamptz/);
  assert.match(sql, /products[\s\S]*archived_at timestamptz/);
});

test("enforces Protocol version, lock, rubric, and TestRun lineage", () => {
  assert.match(sql, /unique \(project_id, version\)/);
  assert.match(sql, /Protocol requires completed and comparable research/);
  assert.match(sql, /Rubric weights must total exactly 100 before locking/);
  assert.match(sql, /Locked protocol % is immutable/);
  assert.match(sql, /unique \(protocol_id, test_case_id, product_id\)/);
  assert.match(sql, /Test runs require the selected locked protocol/);
});

test("enforces complete evidence and score matrices before downstream review", () => {
  assert.match(sql, /Completed research must contain every selected project product/);
  assert.match(sql, /Judge run requires the complete Product × TestCase matrix/);
  assert.match(sql, /every TestRun is ready with linked evidence/);
  assert.match(sql, /full Case × Sample × Rubric score matrix/);
  assert.match(sql, /Review sessions require a completed judge run/);
});

test("keeps blind mapping and artifact correlation server-only", () => {
  const policyTargets = [...sql.matchAll(/create policy\s+\S+\s+on public\.(\w+)/gi)].map((match) => match[1]);
  assert.ok(!policyTargets.includes("blind_mappings"));
  assert.ok(!policyTargets.includes("test_artifacts"));
  assert.ok(!policyTargets.includes("judge_runs"));
  assert.ok(!policyTargets.includes("judge_run_artifacts"));
  assert.match(sql, /revoke all on table public\.blind_mappings from public, anon, authenticated/);
  assert.match(sql, /Never grant ordinary client SELECT before or after reveal/);
});

test("keeps AI scores immutable and human review append-only", () => {
  assert.match(sql, /judge_scores_are_immutable/);
  assert.match(sql, /human_review_events_are_append_only/);
  assert.match(sql, /override_score[\s\S]*char_length\(btrim\(coalesce\(reason, ''\)\)\) > 0/);
  assert.match(sql, /reviewing' and new\.status = 'locked'/);
  assert.match(sql, /locked' and new\.status = 'revealed'/);
  assert.match(sql, /latest_event[\s\S]*score_revision desc/);
});

test("binds downstream output to Final Score and real artifacts", () => {
  assert.match(sql, /private\.final_score_signature/);
  assert.match(sql, /Result analysis final score signature is stale or invalid/);
  assert.match(sql, /Report source analysis is stale/);
  assert.match(sql, /Report evidence must reference a TestArtifact from its analyzed Protocol/);
  assert.match(sql, /completed Report must retain at least one Artifact evidence link/);
  assert.match(sql, /Publish packs require a completed report/);
  assert.match(sql, /Publish screenshot must reference an image TestArtifact from the analyzed Protocol/);
  assert.match(sql, /ready PublishPack must retain at least one screenshot Artifact/);
});

test("creates a private artifact bucket without browser storage policies", () => {
  assert.match(sql, /'benchmark-artifacts'[\s\S]*false,[\s\S]*52428800/);
  assert.doesNotMatch(sql, /create policy[\s\S]{0,120}on storage\.objects/i);
});

test("records provider-neutral AI run metadata without storing reasoning traces", () => {
  assert.match(providerSql, /provider text[\s\S]*provider in \('zhipu', 'deepseek'\)/);
  assert.match(providerSql, /input_tokens bigint/);
  assert.match(providerSql, /output_tokens bigint/);
  assert.match(providerSql, /latency_ms integer/);
  assert.match(providerSql, /estimated_cost numeric/);
  assert.doesNotMatch(providerSql, /reasoning_content|chain_of_thought/i);
});

test("routes every Blind Sample in a TestCase through one immutable JudgeCaseRun", () => {
  assert.match(providerSql, /create table public\.judge_case_runs/);
  assert.match(providerSql, /unique \(judge_run_id, test_case_id\)/);
  assert.match(providerSql, /add column judge_case_run_id uuid not null/);
  assert.match(providerSql, /Every Blind Sample in a TestCase must use the JudgeCaseRun model and prompt version/);
  assert.match(providerSql, /Completed JudgeRun requires one completed JudgeCaseRun per TestCase/);
  assert.match(providerSql, /revoke all on table public\.judge_case_runs from public, anon, authenticated/);
  assert.match(judgeHardeningSql, /JudgeCaseRun can only start inside a running JudgeRun/);
  assert.match(judgeHardeningSql, /full Sample × Rubric score matrix for its TestCase/);
});

test("creates a Project and its 1-3 Products atomically", () => {
  assert.match(projectCreationSql, /create function public\.create_benchmark_project/);
  assert.match(projectCreationSql, /jsonb_array_length\(p_products\)/);
  assert.match(projectCreationSql, /product_count < 1 or product_count > 3/);
  assert.match(projectCreationSql, /on conflict \(normalized_name\) do update/);
  assert.match(projectCreationSql, /insert into public\.project_products/);
  assert.match(projectCreationSql, /grant execute[\s\S]*to service_role/);
  assert.doesNotMatch(projectCreationSql, /grant execute[\s\S]*to (?:anon|authenticated)/);
});

test("enforces traceable versioned ResearchRun lifecycle", () => {
  assert.match(researchLifecycleSql, /product_research_sources_nonempty/);
  assert.match(researchLifecycleSql, /begin_product_research/);
  assert.match(researchLifecycleSql, /complete_product_research/);
  assert.match(researchLifecycleSql, /fail_product_research/);
  assert.match(researchLifecycleSql, /search_provider/);
  assert.match(researchLifecycleSql, /comparability_provider/);
  assert.doesNotMatch(researchLifecycleSql, /on delete cascade/i);
  assert.match(neutralResearchSql, /create or replace function public\.complete_product_research/);
  assert.doesNotMatch(neutralResearchSql, /p_search_provider <> 'zhipu'|p_comparability_provider <> 'deepseek'/);
});

test("persists and locks complete Protocol versions through service-role transactions", () => {
  assert.match(protocolLifecycleSql, /create function public\.create_protocol_draft/);
  assert.match(protocolLifecycleSql, /insert into public\.protocols/);
  assert.match(protocolLifecycleSql, /insert into public\.test_cases/);
  assert.match(protocolLifecycleSql, /insert into public\.rubric_dimensions/);
  assert.match(protocolLifecycleSql, /Rubric weights must total exactly 100/);
  assert.match(protocolLifecycleSql, /Only the latest Protocol version can be locked/);
  assert.match(protocolLifecycleSql, /grant execute[\s\S]*to service_role/);
  assert.doesNotMatch(protocolLifecycleSql, /grant execute[\s\S]*to (?:anon|authenticated)/);
  assert.doesNotMatch(protocolLifecycleSql, /on delete cascade/i);
});

test("derives TestRuns and stores immutable raw Artifacts through service-role transactions", () => {
  assert.match(testExecutionLifecycleSql, /ensure_test_run_matrix/);
  assert.match(testExecutionLifecycleSql, /Product x TestCase/);
  assert.match(testExecutionLifecycleSql, /record_test_artifact/);
  assert.match(testExecutionLifecycleSql, /finalize_test_execution/);
  assert.match(testExecutionLifecycleSql, /ready_for_review/);
  assert.doesNotMatch(testExecutionLifecycleSql, /on delete cascade/i);
});

test("initializes one stable randomized Blind Layer without returning identity data", () => {
  assert.match(blindLayerLifecycleSql, /create function public\.initialize_blind_layer/);
  assert.match(blindLayerLifecycleSql, /order by extensions\.gen_random_uuid\(\)/);
  assert.match(blindLayerLifecycleSql, /Existing Blind Layer is incomplete and cannot be silently repaired/);
  assert.match(blindLayerLifecycleSql, /returns void/);
  assert.match(blindLayerLifecycleSql, /grant execute[\s\S]*to service_role/);
  assert.doesNotMatch(blindLayerLifecycleSql, /grant execute[\s\S]*to (?:anon|authenticated)/);
  assert.doesNotMatch(blindLayerLifecycleSql, /on delete cascade/i);
});

test("persists a complete Blind Judge lifecycle through service-role transactions", () => {
  assert.match(judgeLifecycleSql, /begin_judge_run/);
  assert.match(judgeLifecycleSql, /begin_judge_case_run/);
  assert.match(judgeLifecycleSql, /complete_judge_case_run/);
  assert.match(judgeLifecycleSql, /complete_judge_run/);
  assert.match(judgeLifecycleSql, /fail_judge_run/);
  assert.match(judgeLifecycleSql, /grant execute[\s\S]*to service_role/);
  assert.doesNotMatch(judgeLifecycleSql, /grant execute[\s\S]*to (?:anon|authenticated)/);
  assert.doesNotMatch(judgeLifecycleSql, /on delete cascade/i);
});

test("blocks identity-bearing Protocol text before Blind Review projection", () => {
  assert.match(blindIdentityGuardSql, /assert_blind_protocol_safe/);
  assert.match(blindIdentityGuardSql, /Locked Protocol contains product identity/);
  assert.match(blindIdentityGuardSql, /returns void/);
  assert.match(blindIdentityGuardSql, /grant execute[\s\S]*to service_role/);
  assert.doesNotMatch(blindIdentityGuardSql, /grant execute[\s\S]*to (?:anon|authenticated)/);
  assert.doesNotMatch(blindIdentityGuardSql, /on delete cascade/i);
});

test("persists the Human Review lock and reveal lifecycle through service-role transactions", () => {
  assert.match(humanReviewLifecycleSql, /ensure_review_session/);
  assert.match(humanReviewLifecycleSql, /append_human_override/);
  assert.match(humanReviewLifecycleSql, /append_human_revert/);
  assert.match(humanReviewLifecycleSql, /lock_review_session/);
  assert.match(humanReviewLifecycleSql, /reveal_review_session/);
  assert.match(humanReviewLifecycleSql, /get_revealed_review_mapping/);
  assert.match(humanReviewLifecycleSql, /grant execute[\s\S]*to service_role/);
  assert.doesNotMatch(humanReviewLifecycleSql, /grant execute[\s\S]*to (?:anon|authenticated)/);
  assert.doesNotMatch(humanReviewLifecycleSql, /on delete cascade/i);
});

test("persists signature-bound Final Result Analysis through service-role transactions", () => {
  assert.match(resultAnalysisLifecycleSql, /begin_result_analysis/);
  assert.match(resultAnalysisLifecycleSql, /start_result_analysis/);
  assert.match(resultAnalysisLifecycleSql, /complete_result_analysis/);
  assert.match(resultAnalysisLifecycleSql, /fail_result_analysis/);
  assert.match(resultAnalysisLifecycleSql, /private\.final_score_signature/);
  assert.match(resultAnalysisLifecycleSql, /grant execute[\s\S]*to service_role/);
  assert.doesNotMatch(resultAnalysisLifecycleSql, /grant execute[\s\S]*to (?:anon|authenticated)/);
  assert.doesNotMatch(resultAnalysisLifecycleSql, /on delete cascade/i);
});
