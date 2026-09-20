import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const [migration, initialSchema, providerMetadata, hardening, schema, repository, service, page, actions, taskService, router] = await Promise.all([
  read("supabase/migrations/202608170010_judge_lifecycle.sql"),
  read("supabase/migrations/202608170001_initial_benchmark_schema.sql"),
  read("supabase/migrations/202608170002_ai_provider_metadata.sql"),
  read("supabase/migrations/202608170003_harden_judge_case_runs.sql"),
  read("lib/ai/schemas/judge.schemas.ts"),
  read("lib/repositories/judge.repository.ts"),
  read("lib/services/judge.service.ts"),
  read("app/projects/[projectId]/review/page.tsx"),
  read("app/projects/[projectId]/review/actions.ts"),
  read("lib/ai/task-service.ts"),
  read("lib/ai/router.ts"),
]);

test("starts Judge only from a complete locked Artifact-backed Blind matrix", () => {
  assert.match(migration, /status = 'reviewing'/);
  assert.match(migration, /current latest locked Protocol/);
  assert.match(migration, /complete Blind Layer/);
  assert.match(migration, /complete ready Artifact-backed matrix/);
  assert.match(migration, /insert into public\.judge_run_artifacts/);
  assert.match(migration, /set status = 'running'/);
});

test("keeps Product identity inside the database boundary and returns only Sample-labeled evidence", () => {
  assert.match(migration, /create function public\.get_judge_case_inputs/);
  assert.match(migration, /mapping\.blind_sample_id/);
  assert.doesNotMatch(migration.match(/returns table \([\s\S]*?\)\nlanguage plpgsql/)?.[0] ?? "", /product_id|product_name/);
  assert.match(migration, /Locked Protocol contains product identity and is unsafe for Blind Judge/);
  assert.doesNotMatch(repository, /blind_mappings|product_id|product_name/);
  assert.doesNotMatch(service, /productId|productName|\.products/);
  assert.doesNotMatch(page + actions, /productId|productName|workspace\.products|project\.name/);
});

test("routes all Samples in one TestCase through one immutable JudgeCaseRun", () => {
  assert.match(providerMetadata, /unique \(judge_run_id, test_case_id\)/);
  assert.match(providerMetadata, /Every Blind Sample in a TestCase must use the JudgeCaseRun model and prompt version/);
  assert.match(hardening, /full Sample × Rubric score matrix for its TestCase/);
  assert.match(service, /for \(const testCase of context\.testCases\)[\s\S]*executeJudgeCase/);
  assert.match(service, /aiTaskService\.judgeSamples\(testCase\.id, descriptors/);
  assert.match(service, /beforeExecute:[\s\S]*judgeRepository\.beginCase/);
  assert.ok(router.indexOf("await request.beforeExecute?.(route)") < router.indexOf("provider.generateStructured"));
  assert.match(taskService, /selectJudgeTaskForCase\(testCaseId, artifacts\)/);
});

test("sends all supported text formats as text and image/PDF/mixed Cases as original multimodal evidence", () => {
  for (const mimeType of ["text/plain", "text/markdown", "application/json", "text/csv"]) {
    assert.match(router, new RegExp(mimeType.replace("/", "\\/")));
    assert.match(service, new RegExp(mimeType.replace("/", "\\/")));
  }
  assert.match(router, /artifacts\.every\(\(artifact\) => isTextArtifactMimeType\(artifact\.mimeType\)\)/);
  assert.match(service, /prepared\.every\(\(artifact\) => isTextArtifactMimeType\(artifact\.mimeType\)\)/);
  assert.match(service, /type: "image_url"/);
  assert.match(service, /type: "file_url"/);
  assert.match(service, /createHash\("sha256"\)/);
  assert.doesNotMatch(service, /extractArtifactText|runOCR/);
});

test("validates and atomically stores the exact Sample × Rubric score matrix", () => {
  assert.match(schema, /oneDecimalScoreSchema = z\.number\(\)\.min\(0\)\.max\(10\)/);
  assert.match(schema, /aiScore: oneDecimalScoreSchema/);
  assert.match(schema, /confidence: z\.number\(\)\.min\(0\)\.max\(1\)/);
  assert.match(schema, /evidence:[\s\S]*\.min\(1\)/);
  assert.match(service, /assertExactScoreMatrix/);
  assert.match(migration, /JudgeCaseRun score matrix is incomplete/);
  assert.match(migration, /JudgeCaseRun score matrix contains duplicates/);
  assert.match(migration, /insert into public\.judge_scores/);
  assert.match(initialSchema, /judge_scores_are_immutable/);
});

test("records failed runs and never falls back to Mock or another provider", () => {
  assert.match(migration, /create function public\.fail_judge_run/);
  assert.match(service, /judgeRepository\.fail/);
  assert.doesNotMatch(service + repository + actions, /@\/lib\/mock|mockJudge|fallback/i);
});

test("runs Judge Cases sequentially to avoid provider quota spikes", () => {
  assert.match(service, /for \(const testCase of context\.testCases\)/);
  assert.match(service, /maxTokens: 9_000/);
  assert.match(service, /maxAttempts: 3/);
  assert.doesNotMatch(service, /Promise\.allSettled\([\s\S]*executeJudgeCase/);
});

test("keeps every Judge mutation service-role only", () => {
  assert.match(migration, /revoke all on function public\.begin_judge_run[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.begin_judge_run[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /grant execute[\s\S]*to (?:anon|authenticated)/);
});
