import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const [migration, initialSchema, repository, service, page, testPage] = await Promise.all([
  read("supabase/migrations/202608170009_blind_layer_lifecycle.sql"),
  read("supabase/migrations/202608170001_initial_benchmark_schema.sql"),
  read("lib/repositories/blind-review.repository.ts"),
  read("lib/services/blind-review.service.ts"),
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
  assert.match(repository, /\.rpc\("initialize_blind_layer"/);
  assert.match(repository, /\.from\("blind_samples"\)/);
  assert.match(repository, /id, protocol_id, label, created_at/);
  assert.doesNotMatch(repository, /blind_mappings|product_id|products/);
});

test("server projection contains only anonymous samples and neutral TestCase metadata", () => {
  assert.match(service, /projectId:[\s\S]*protocolId:[\s\S]*protocolVersion:[\s\S]*samples:[\s\S]*testCases:/);
  assert.match(service, /sampleId: sample\.id, label: sample\.label/);
  assert.match(service, /id: testCase\.id, position: index \+ 1, title: testCase\.title/);
  assert.doesNotMatch(service, /productId|productName|blindMapping|blind_mappings|projectName/);
  assert.doesNotMatch(service + page, /@\/lib\/mock|mockJudge|mockBlind/);
});

test("Blind Review UI never serializes project or product identity", () => {
  assert.match(page, /getBlindReviewWorkspace/);
  assert.match(page, /workspace\.samples\.map/);
  assert.match(page, /workspace\.testCases\.map/);
  assert.doesNotMatch(page, /project\.name|product\.name|productId|productName|workspace\.products/);
  assert.match(testPage, /href={`\/projects\/\$\{project\.id\}\/review`}/);
});
