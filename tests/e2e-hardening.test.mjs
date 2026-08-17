import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(relativePath) { return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8"); }

const [
  researchPage, researchService, testPage, testService, blindService, judgePage, judgeService,
  reviewMigration, reviewService, resultsPage, resultService, resultMigration, reportService,
  testMigration, blindMigration, initialSchema, publishService, publishMigration,
] = await Promise.all([
  read("app/projects/[projectId]/research/page.tsx"),
  read("lib/services/research.service.ts"),
  read("app/projects/[projectId]/test/page.tsx"),
  read("lib/services/test-execution.service.ts"),
  read("lib/services/blind-review.service.ts"),
  read("app/projects/[projectId]/review/page.tsx"),
  read("lib/services/judge.service.ts"),
  read("supabase/migrations/202608170012_human_review_lifecycle.sql"),
  read("lib/services/human-review.service.ts"),
  read("app/projects/[projectId]/results/page.tsx"),
  read("lib/services/result-analysis.service.ts"),
  read("supabase/migrations/202608170013_result_analysis_lifecycle.sql"),
  read("lib/services/report.service.ts"),
  read("supabase/migrations/202608170008_test_execution_lifecycle.sql"),
  read("supabase/migrations/202608170009_blind_layer_lifecycle.sql"),
  read("supabase/migrations/202608170001_initial_benchmark_schema.sql"),
  read("lib/services/publish.service.ts"),
  read("supabase/migrations/202608170015_publish_pack_lifecycle.sql"),
]);

test("Research failure is persisted and exposed as an explicit retry state", () => {
  assert.match(researchService, /researchRepository\.fail/);
  assert.match(researchPage, /latestFailed/);
  assert.match(researchPage, /ResearchRun v\$\{latestRun\.version\} 未完成/);
  assert.match(researchPage, /retry=\{latestFailed\}/);
  assert.doesNotMatch(researchService, /mock|fallback/i);
});

test("an unlocked Protocol cannot enter Test Execution", () => {
  assert.match(testService, /protocol\.status !== "locked"/);
  assert.match(testPage, /redirect\(`\/projects\/\$\{projectId\}\/protocol`\)/);
  assert.match(testPage, /Protocol v\{protocol\.version\} 已锁定/);
});

test("an incomplete TestRun matrix cannot initialize Blind Review", () => {
  assert.match(testPage, /等待完整上传/);
  assert.match(blindService, /全部原始测试结果确认后开始/);
  assert.match(blindMigration, /complete ready Product x TestCase Artifact matrix/);
});

test("Artifact upload failures remain failures and cannot finalize missing evidence", () => {
  assert.match(testService, /removeStorageObject/);
  assert.match(testService, /TestExecutionError/);
  assert.match(testMigration, /Every TestRun needs at least one raw Artifact before finalization/);
  assert.match(testMigration, /Artifact upload requires the current locked Protocol/);
});

test("Judge failures are persisted and retry creates an auditable run", () => {
  assert.match(judgeService, /judgeRepository\.fail/);
  assert.match(judgeService, /judgeRepository\.begin/);
  assert.match(judgePage, /failed/);
  assert.match(judgePage, /RunBlindJudgeAction projectId=\{workspace\.projectId\} retry/);
  assert.doesNotMatch(judgeService, /mock|fallback/i);
});

test("early reveal and downstream access are rejected before Review lock", () => {
  assert.match(reviewMigration, /status = 'locked'/);
  assert.match(reviewService, /只有锁定最终评分后才能揭晓产品身份/);
  assert.match(resultService, /review\.status !== "revealed"/);
  assert.match(resultsPage, /redirect\(`\/projects\/\$\{projectId\}\/review`\)/);
});

test("invalid Human Override values and missing reasons are rejected", () => {
  assert.match(reviewMigration, /p_override_score < 0/);
  assert.match(reviewMigration, /p_override_score > 10/);
  assert.match(reviewMigration, /p_override_score \* 10 <> trunc\(p_override_score \* 10\)/);
  assert.match(reviewMigration, /char_length\(btrim\(coalesce\(p_reason, ''\)\)\)/);
});

test("stale Final Result Analysis is never reused downstream", () => {
  assert.match(resultService, /latest\.final_score_signature !== finalScoreSignature/);
  assert.match(resultMigration, /private\.final_score_signature/);
  assert.match(reportService, /current\.stale/);
  assert.match(initialSchema, /Result analysis final score signature is stale or invalid/);
});

test("Report and Publish cannot complete without real Protocol Artifact evidence", () => {
  assert.match(initialSchema, /A completed Report must retain at least one Artifact evidence link/);
  assert.match(initialSchema, /Report evidence must reference a TestArtifact from its analyzed Protocol/);
  assert.match(publishService, /imageArtifacts\.length === 0/);
  assert.match(publishMigration, /ready PublishPack must retain at least one screenshot Artifact/);
});
