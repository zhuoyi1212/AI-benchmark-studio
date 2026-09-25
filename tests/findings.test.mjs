import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [migration, publishSourceMigration, schema, repository, service, page, editor, testPage, publishService, publishRepository] = await Promise.all([
  read("supabase/migrations/20260920072407_quick_findings_flow.sql"),
  read("supabase/migrations/20260923090000_allow_findings_publish_pack_source.sql"),
  read("lib/ai/schemas/findings.schemas.ts"),
  read("lib/repositories/findings.repository.ts"),
  read("lib/services/findings.service.ts"),
  read("app/projects/[projectId]/results/page.tsx"),
  read("app/projects/[projectId]/results/findings-editor.tsx"),
  read("app/projects/[projectId]/test/page.tsx"),
  read("lib/services/publish.service.ts"),
  read("lib/repositories/publish.repository.ts"),
]);

test("persists Findings independently from Result Analysis and Report", () => {
  assert.match(migration, /create table public\.experience_findings/);
  assert.match(migration, /protocol_id uuid not null/);
  assert.match(migration, /human_output jsonb/);
  assert.match(migration, /human_confirmed_at timestamptz/);
  assert.match(migration, /Only unconfirmed completed Findings can be confirmed/);
  assert.match(migration, /set status = 'completed', updated_at = now\(\)[\s\S]*human_confirmed_at/);
  assert.match(migration, /Findings requires a complete Artifact-backed TestRun matrix/);
  const findingsFunctions = migration.slice(migration.indexOf("create or replace function public.begin_experience_findings"), migration.indexOf("alter table public.publish_packs"));
  assert.doesNotMatch(findingsFunctions, /review_sessions|result_analyses|reports/);
  assert.match(migration, /Older builds initialized Blind Layer/);
});

test("Findings are evidence-backed observations rather than scores", () => {
  assert.match(schema, /z\.enum\(\["good", "neutral", "problem"\]\)/);
  assert.match(schema, /evidenceArtifactIds/);
  assert.match(schema, /findings: z\.array\(experienceFindingItemSchema\)\.min\(1\)\.max\(12\)/);
  assert.doesNotMatch(schema, /score|ranking|winner/i);
  assert.match(service, /不是评分员/);
  assert.match(service, /不要生成分数、排名、冠军或总评等级/);
  assert.match(service, /readTextArtifact/);
  assert.match(service, /createHash\("sha256"\)/);
  assert.match(service, /type: "image_url"/);
  assert.match(service, /type: "file_url"/);
  assert.match(service, /normalizeMimeType\(artifact\.fileType\)/);
  assert.match(service, /mimeType === "application\/pdf" && hasTextArtifact/);
  assert.match(service, /Image omitted because this TestRun has a text Artifact/);
  assert.match(service, /renderPdfEvidence\(await readArtifactBytes\(artifact\)/);
  assert.match(service, /extractPdfText\(await readArtifactBytes\(artifact\), maxTextCharacters\)/);
  assert.match(service, /original PDF page/);
  assert.match(service, /maxImagesPerVisionRequest = 2/);
  assert.match(service, /aiTaskService\.understandScreenshots/);
  assert.match(service, /Screenshot batching started/);
  assert.match(service, /\.length\(batch\.length\)/);
  assert.match(service, /batch\[observationIndex\]/);
  assert.match(service, /provider=\$\{error\.provider\}/);
  assert.match(service, /model=\$\{error\.model\}/);
  assert.match(service, /status=\$\{error\.status/);
  assert.match(service, /category=\$\{error\.category\}/);
  assert.match(service, /providerCode=\$\{error\.providerCode\}/);
  assert.match(service, /images=\$\{error\.requestImageCount\}/);
  assert.match(service, /realArtifactReferences/);
  assert.match(service, /normalizeSingleRunReferences/);
  assert.match(service, /test\.testRuns\.length !== 1/);
  assert.doesNotMatch(service, /judgeRepository|resultAnalysisRepository|getReportWorkspace/);
});

test("human review confirms or edits Findings instead of changing scores", () => {
  assert.match(repository, /confirm_experience_findings/);
  assert.match(editor, /人工确认 Findings/);
  assert.match(editor, /这里不是改分数/);
  assert.match(editor, /好用/);
  assert.match(editor, /一般/);
  assert.match(editor, /问题/);
  assert.match(editor, /至少保留 1 条/);
  assert.match(page, /FindingsEditor/);
});

test("quick test auto-runs Blind Judge before generating Findings", () => {
  assert.doesNotMatch(testPage, /href=\{`\/projects\/\$\{project\.id\}\/results`\}/);
  assert.match(testPage, /QuickAutoAdvance/);
  assert.match(page, /已完成的 Blind Judge/);
  assert.match(page, /专业报告（后台生成）/);
  assert.match(page, /生成社区内容/);
});

test("Quick Findings requires a revealed Blind Review", () => {
  assert.match(page, /getExperienceFindingsWorkspace\(projectId\)/);
  assert.match(page, /workflowState\.stages\.review\.completed/);
  assert.match(page, /redirect\(`\/projects\/\$\{projectId\}\/review`\)/);
  assert.match(page, /workflowState\.stages\.review\.completed\s*\?\s*await readOptionalProfessionalResults\(projectId\)\s*:\s*null/);
  const pageLoad = page.slice(0, page.indexOf("async function readOptionalProfessionalResults"));
  assert.doesNotMatch(pageLoad, /Promise\.all\(\[[\s\S]*getResultsWorkspace\(projectId\)/);
  assert.match(page, /专业报告（后台生成）/);
});

test("a professional Results read failure cannot fail the Quick Findings page", () => {
  assert.match(page, /async function readOptionalProfessionalResults/);
  assert.match(page, /try \{[\s\S]*getResultsWorkspace\(projectId\)[\s\S]*catch \(error\)/);
  assert.match(page, /OptionalProfessionalResultsReadError/);
  assert.match(page, /return null;/);
});

test("Quick Findings validates Review through the service boundary", () => {
  assert.doesNotMatch(service, /blindReviewRepository|judgeRepository|resultAnalysisRepository|reportRepository/);
  assert.doesNotMatch(service, /getBlindReviewWorkspace|getJudgeReviewWorkspace|getResultsWorkspace|getReportWorkspace/);
  const generation = service.slice(service.indexOf("export async function generateExperienceFindings"), service.indexOf("export async function buildRawFindingsEvidenceContent"));
  assert.doesNotMatch(generation, /blindReviewRepository|judgeRepository|humanReviewRepository|resultAnalysisRepository|reportRepository|getBlindReviewWorkspace|getJudgeReviewWorkspace|getResultsWorkspace|getReportWorkspace/i);
  assert.match(generation, /getTestExecutionWorkspace/);
  assert.match(generation, /getResearchWorkspace/);
  assert.match(generation, /readHumanReview/);
  assert.match(generation, /review\.status !== "revealed"/);
  assert.match(generation, /buildArtifactContent/);
});

test("PublishPack can bind either confirmed Findings or a professional Report", () => {
  assert.match(migration, /findings_id uuid/);
  assert.match(migration, /num_nonnulls\(report_id, findings_id\) = 1/);
  assert.match(migration, /begin_findings_publish_pack/);
  assert.match(migration, /PublishPack requires confirmed Findings/);
  assert.match(publishSourceMigration, /new\.report_id is not null/);
  assert.match(publishSourceMigration, /new\.findings_id is not null/);
  assert.match(publishSourceMigration, /human_confirmed_at is not null/);
  assert.match(publishSourceMigration, /old\.report_id, old\.findings_id, old\.version/);
  assert.match(publishRepository, /beginFromFindings/);
  assert.match(publishRepository, /listByFindings/);
  assert.match(publishService, /source\.kind === "findings"/);
  assert.match(publishService, /humanConfirmedFindings/);
  assert.match(publishService, /优先使用真实 Case/);
  assert.match(publishService, /buildRawFindingsEvidenceContent/);
  assert.match(publishService, /完整原始 Artifact/);
});

test("new public Findings functions remain service-role only", () => {
  for (const fn of ["begin_experience_findings", "start_experience_findings", "complete_experience_findings", "confirm_experience_findings", "fail_experience_findings", "begin_findings_publish_pack", "start_professional_review"]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${fn}[^;]+from public, anon, authenticated`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${fn}[^;]+to service_role`));
  }
});
