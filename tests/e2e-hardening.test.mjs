import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(relativePath) { return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8"); }

const [
  researchPage, researchService, testPage, testService, blindService, judgePage, judgeService,
  reviewMigration, reviewService, resultsPage, resultService, resultMigration, reportService,
  testMigration, blindMigration, initialSchema, publishService, publishMigration, textOnlyPublishMigration,
  e2eRunner, e2eRoute, providerEndpoints, providerMock, legacyVerifier,
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
  read("supabase/migrations/20260824090000_allow_text_only_publish_packs.sql"),
  read("scripts/run-self-contained-e2e.mjs"),
  read("app/api/_e2e/full-flow/route.ts"),
  read("lib/ai/providers/endpoints.ts"),
  read("scripts/e2e-provider-mock.mjs"),
  read("scripts/verify-full-e2e.mjs"),
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

test("professional analysis and quick Findings both preserve Review reveal", () => {
  assert.match(reviewMigration, /status = 'locked'/);
  assert.match(reviewService, /只有锁定最终评分后才能揭晓产品身份/);
  assert.match(resultService, /review\.status !== "revealed"/);
  assert.match(resultsPage, /getExperienceFindingsWorkspace/);
  assert.match(resultsPage, /!workflowState\.stages\.review\.completed/);
  assert.match(resultsPage, /redirect\(\`\/projects\/\$\{projectId\}\/review\`\)/);
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

test("Report requires real evidence while Publish may omit screenshots without inventing evidence", () => {
  assert.match(initialSchema, /A completed Report must retain at least one Artifact evidence link/);
  assert.match(initialSchema, /Report evidence must reference a TestArtifact from its analyzed Protocol/);
  assert.match(publishService, /experiment\.products\.flatMap/);
  assert.doesNotMatch(publishService, /没有可用的原始截图，不能生成/);
  assert.match(textOnlyPublishMigration, /p_recommendations[\s\S]*between 0 and 9/);
  assert.match(publishMigration, /publish_pack_artifacts/);
});

test("full route E2E owns a unique temporary Project lifecycle instead of a fixed database Fixture", () => {
  assert.match(e2eRunner, /randomUUID/);
  assert.match(e2eRoute, /\[E2E\] Single Product Flow \$\{runId\}/);
  assert.match(e2eRoute, /softDeleteProject/);
  assert.match(e2eRunner, /project\.deleted_at && project\.name\.includes\(runId\)/);
  assert.match(e2eRoute, /pasted-raw-output\.txt/);
  assert.match(e2eRoute, /application\/octet-stream/);
  assert.match(e2eRoute, /preserved byte-for-byte/);
  assert.doesNotMatch(`${e2eRunner}\n${e2eRoute}\n${legacyVerifier}`, /\[E2E Fixture\] M14 Complete Flow/);
});

test("full route E2E uses real services and mocks only the local external AI boundary", () => {
  for (const operation of [
    "createProject", "executeProductResearch", "generateProtocol", "uploadTestArtifact",
    "startProfessionalReview", "runBlindJudge", "lockHumanReview", "revealHumanReview", "generateFinalResultAnalysis",
    "generateReport", "discoverContentIdeas", "generateCommunityPost",
  ]) assert.match(e2eRoute, new RegExp(operation));
  assert.match(providerEndpoints, /E2E_TEST_MODE !== "1"/);
  assert.match(providerEndpoints, /process\.env\.NODE_ENV === "production"/);
  assert.match(providerEndpoints, /apiKey: e2eCredential/);
  assert.match(providerEndpoints, /localhost|127\.0\.0\.1/);
  assert.match(providerMock, /Search context: \$\{query\}/);
});

test("full route E2E verifies Blind Review before Quick Findings and Findings Publish", () => {
  const flow = e2eRoute.slice(e2eRoute.indexOf("async function runSingleProductFlow"));
  const findings = flow.indexOf("generateExperienceFindings");
  const confirmation = flow.indexOf("confirmExperienceFindings");
  const quickPublish = flow.indexOf('quickPublish.sourceType === "findings"');
  const professional = flow.indexOf("startProfessionalReview");
  assert.ok(professional >= 0 && findings > professional && confirmation > findings && quickPublish > confirmation);
  assert.match(e2eRoute, /Quick Findings requires completed Blind Review/);
  assert.match(e2eRoute, /quickPublishReady: publish\.pack\?\.status === "ready"/);
  assert.match(e2eRunner, /ExperienceFindings/);
  assert.match(e2eRunner, /CommunityPostDraft/);
  assert.match(e2eRunner, /CommunityPostRevision/);
  assert.match(e2eRunner, /EvidenceCheckedCommunityPost/);
  assert.doesNotMatch(e2eRunner, /taskCounts\.MicroFindingDiscovery/);
  assert.match(providerMock, /schemaName === "ExperienceFindings"/);
  assert.match(providerMock, /schemaName === "ContentIdeas"/);
  assert.match(providerMock, /schemaName === "CommunityPostDraft"/);
  assert.match(providerMock, /schemaName === "CommunityPostRevision"/);
  assert.match(providerMock, /schemaName === "EvidenceCheckedCommunityPost"/);
});

test("full E2E client allows the route to finish its bounded cleanup and response", () => {
  assert.match(e2eRunner, /AbortSignal\.timeout\(600_000\)/);
  assert.match(e2eRunner, /const response = await postFullFlow/);
  assert.match(e2eRunner, /httpRequest\(url, \{ method: options\.method, headers: options\.headers, signal: options\.signal \}/);
  assert.match(e2eRunner, /allowing server-side cleanup 30 seconds to finish/);
});
