import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const [migration, repository, service, page, actions, actionComponent, config, schema] = await Promise.all([
  read("supabase/migrations/202608170008_test_execution_lifecycle.sql"),
  read("lib/repositories/test-execution.repository.ts"),
  read("lib/services/test-execution.service.ts"),
  read("app/projects/[projectId]/test/page.tsx"),
  read("app/projects/[projectId]/test/actions.ts"),
  read("app/projects/[projectId]/test/test-actions.tsx"),
  read("next.config.ts"),
  read("supabase/migrations/202608170001_initial_benchmark_schema.sql"),
]);

test("derives an exact idempotent Product x TestCase matrix from the latest locked Protocol", () => {
  assert.match(migration, /create function public\.ensure_test_run_matrix/);
  assert.match(migration, /cross join public\.project_products/);
  assert.match(migration, /on conflict \(protocol_id, test_case_id, product_id\) do nothing/);
  assert.match(migration, /current latest locked Protocol/);
  assert.match(migration, /TestRun matrix must exactly match Product x TestCase/);
  assert.match(repository, /\.rpc\("ensure_test_run_matrix"/);
});

test("uploads only validated raw multimodal evidence to private Storage", () => {
  assert.match(schema, /'benchmark-artifacts'[\s\S]*false,[\s\S]*52428800/);
  assert.match(repository, /\.storage[\s\S]*\.upload\(/);
  assert.match(repository, /createSignedUrl\(path, 3600\)/);
  assert.match(repository, /attempt <= 3[\s\S]*attempt \* 250/);
  assert.match(service, /validateFileSignature/);
  assert.match(service, /maxTextArtifactBytes = 500_000/);
  assert.match(service, /mimeTypeByExtension/);
  for (const extension of ["txt", "md", "json", "csv", "mov"]) assert.match(service, new RegExp(`${extension}:`));
  assert.match(service, /sha256/);
  assert.match(service, /raw_test_output/);
  assert.match(service, /removeStorageObject/);
  assert.match(config, /bodySizeLimit: "51mb"/);
});

test("records immutable Artifact and execution metadata in one database transaction", () => {
  assert.match(migration, /create function public\.record_test_artifact/);
  assert.match(migration, /insert into public\.test_artifacts/);
  assert.match(migration, /generation_time_seconds/);
  assert.match(migration, /retry_count/);
  assert.match(migration, /manually_edited/);
  assert.match(migration, /Artifact storage path does not match its TestRun lineage/);
  assert.match(repository, /\.rpc\("record_test_artifact"/);
});

test("finalizes only a complete Artifact-backed matrix without auto-starting scoring", () => {
  assert.match(migration, /create function public\.finalize_test_execution/);
  assert.match(migration, /Every TestRun needs at least one raw Artifact before finalization/);
  assert.match(migration, /set status = 'ready_for_review'/);
  assert.match(repository, /\.rpc\("finalize_test_execution"/);
  assert.doesNotMatch(service, /blindReviewRepository/);
  assert.match(actions, /startProfessionalReviewAction/);
  assert.match(actionComponent, /ProfessionalReviewAction/);
  assert.match(service, /run\.artifacts\.length === 0/);
  assert.doesNotMatch(service, /missingEvidenceTypes/);
  assert.match(page, /至少上传 1 个原始文件即可进入分析/);
  assert.match(page, /输出参考/);
});

test("real Test Execution route validates actions and never imports demo data", () => {
  assert.match(page, /getTestExecutionWorkspace/);
  assert.match(page, /redirect\(`\/projects\/\$\{projectId\}\/protocol`\)/);
  assert.match(actions, /instanceof File/);
  assert.match(actions, /pasted-raw-output\.txt/);
  assert.match(actions, /rawText\.trim\(\)\.length > 0[\s\S]*new File\(\[rawText\]/);
  assert.match(actionComponent, /直接粘贴文本/);
  assert.match(actionComponent, /name="rawText"/);
  assert.match(actions, /TestExecutionError/);
  assert.match(actionComponent, /\.doc,\.docx,\.xls,\.xlsx,\.ppt,\.pptx/);
  assert.match(page, /QuickAutoAdvance/);
  assert.match(page, /开始 Blind Judge/);
  assert.doesNotMatch(page, /href=\{`\/projects\/\$\{project\.id\}\/results`\}/);
  assert.doesNotMatch(page + actions + actionComponent + service + repository, /@\/lib\/mock|mockTestRuns|\/projects\/demo/);
});

test("keeps Test Execution mutations service-role only", () => {
  assert.match(migration, /grant execute[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /grant execute[\s\S]*to (?:anon|authenticated)/);
});
