import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../supabase/migrations/202608170001_initial_benchmark_schema.sql", import.meta.url);
const sql = await readFile(migrationUrl, "utf8");

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
