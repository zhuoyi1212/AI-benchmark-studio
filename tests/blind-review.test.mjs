import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const [migration, identityGuard, initialSchema, repository, service, testService, page, testPage] = await Promise.all([
  read("supabase/migrations/202608170009_blind_layer_lifecycle.sql"),
  read("supabase/migrations/202608170011_blind_protocol_identity_guard.sql"),
  read("supabase/migrations/202608170001_initial_benchmark_schema.sql"),
  read("lib/repositories/blind-review.repository.ts"),
  read("lib/services/blind-review.service.ts"),
  read("lib/services/test-execution.service.ts"),
  read("app/projects/[projectId]/review/page.tsx"),
  read("app/projects/[projectId]/test/page.tsx"),
]);

test("creates a complete randomized Blind Layer exactly once", () => {
  assert.match(migration, /status in \('testing', 'reviewing'\)/);
  assert.match(migration, /ready_run_count <> expected_run_count/);
  assert.match(migration, /exists \([\s\S]*from public\.test_artifacts/);
  assert.match(migration, /order by extensions\.gen_random_uuid\(\)/);
  assert.match(migration, /'Sample ' \|\| chr\(64 \+ sample_number\)/);
  assert.match(migration, /existing_sample_count > 0 or existing_mapping_count > 0/);
  assert.match(migration, /Existing Blind Layer is incomplete and cannot be silently repaired/);
  assert.match(migration, /return;/);
});

test("never exposes mappings through the initialization RPC or ordinary client grants", () => {
  assert.match(migration, /returns void/);
  assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /grant execute[\s\S]*to (?:anon|authenticated)/);
  assert.match(initialSchema, /Deliberately no policy on blind_mappings/);
  assert.match(initialSchema, /revoke all on table public\.blind_mappings from public, anon, authenticated/);
});

test("repository deliberately offers samples but no identity-mapping read method", () => {
  assert.match(repository, /\.rpc\("assert_blind_protocol_safe"/);
  assert.match(repository, /\.rpc\("initialize_blind_layer"/);
  assert.match(repository, /\.from\("blind_samples"\)/);
  assert.match(repository, /id, protocol_id, label, created_at/);
  assert.doesNotMatch(repository, /blind_mappings|product_id|products/);
});

test("rejects identity-bearing Protocol text before projecting Blind Review and initializes only on explicit finalization", () => {
  assert.match(identityGuard, /create function public\.assert_blind_protocol_safe/);
  assert.match(identityGuard, /status = 'locked'/);
  assert.match(identityGuard, /project_products/);
  assert.match(identityGuard, /test_cases/);
  assert.match(identityGuard, /rubric_dimensions/);
  assert.match(identityGuard, /returns void/);
  assert.match(identityGuard, /revoke all[\s\S]*from public, anon, authenticated/);
  assert.doesNotMatch(identityGuard, /grant execute[\s\S]*to (?:anon|authenticated)/);
  assert.ok(service.indexOf("assertProtocolSafe") < service.indexOf("listSamples"));
  assert.doesNotMatch(service, /blindReviewRepository\.initialize/);
  assert.ok(testService.indexOf("testExecutionRepository.finalize") < testService.indexOf("blindReviewRepository.initialize"));
});

test("server projection contains only anonymous samples and neutral TestCase metadata", () => {
  assert.match(service, /projectId:[\s\S]*protocolId:[\s\S]*protocolVersion:[\s\S]*samples:[\s\S]*testCases:/);
  assert.match(service, /sampleId: sample\.id, label: sample\.label/);
  assert.match(service, /id: testCase\.id, position: index \+ 1, title: testCase\.title/);
  assert.doesNotMatch(service, /productId|productName|blindMapping|blind_mappings|projectName/);
  assert.doesNotMatch(service + page, /@\/lib\/mock|mockJudge|mockBlind/);
});

test("Blind Review UI never serializes project or product identity", () => {
  assert.match(page, /getJudgeReviewWorkspace/);
  assert.match(page, /workspace\.samples\.map/);
  assert.match(page, /workspace\.testCases\.map/);
  assert.doesNotMatch(page, /project\.name|product\.name|productId|productName|workspace\.products/);
  assert.match(testPage, /href={`\/projects\/\$\{project\.id\}\/review`}/);
});
