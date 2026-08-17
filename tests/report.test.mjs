import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(relativePath) { return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8"); }

const [migration, schema, repository, service, page, actions] = await Promise.all([
  read("supabase/migrations/202608170014_report_lifecycle.sql"),
  read("lib/ai/schemas/report.schemas.ts"),
  read("lib/repositories/report.repository.ts"),
  read("lib/services/report.service.ts"),
  read("app/projects/[projectId]/report/page.tsx"),
  read("app/projects/[projectId]/report/actions.ts"),
]);

test("binds every Report version to one current completed ResultAnalysis", () => {
  assert.match(migration, /where id = p_result_analysis_id/);
  assert.match(migration, /status = 'completed'/);
  assert.match(migration, /private\.final_score_signature/);
  assert.match(migration, /Report source analysis is stale/);
  assert.match(migration, /coalesce\(max\(version\), 0\) \+ 1/);
});

test("links real Protocol Artifacts before a Report may complete", () => {
  assert.match(migration, /insert into public\.report_artifacts/);
  assert.match(migration, /join public\.test_artifacts artifact/);
  assert.match(migration, /test_run\.protocol_id = target_analysis\.protocol_id/);
  assert.match(migration, /Report requires real TestArtifact evidence/);
  assert.match(page, /Raw Artifact/);
  assert.match(page, /item\.fileUrl/);
});

test("persists centralized Report route before the provider call", () => {
  assert.match(service, /aiTaskService\.generateReport/);
  assert.match(service, /beforeExecute: \(route\) => reportRepository\.start/);
  assert.match(repository, /p_provider: route\.provider/);
  assert.match(repository, /p_model: route\.model/);
  assert.match(repository, /p_prompt_version: route\.promptVersion/);
  assert.doesNotMatch(service + page + actions, /glm-|deepseek-v|provider:\s*["']/);
});

test("keeps score, ranking, winner, evidence, and limitations outside generated Report output", () => {
  const outputSchema = schema.match(/generatedReportSchema[\s\S]*?export type GeneratedReport/)?.[0] ?? "";
  assert.doesNotMatch(outputSchema, /finalScore|winnerProductId|winnerReason|rank:|limitations:|evidence:/);
  assert.match(service, /不得重新判分，不得改变排名、冠军、Judge Evidence 或限制/);
  assert.match(schema, /generatedReportResponseSchema/);
  assert.match(schema, /Report contains an internal identifier/);
  assert.match(schema, /userVisibleText/);
  assert.doesNotMatch(schema, /internalIdentifierPattern\.test\(JSON\.stringify\(value\)\)/);
  assert.match(service, /assertExactCoverage/);
  assert.match(service, /calculateCaseScores/);
  assert.match(page, /workspace\.ranking/);
  assert.match(page, /workspace\.analysis\.products/);
  assert.match(page, /workspace\.analysis\.limitations/);
});

test("uses real Research, Protocol, Final Score, analysis, and human disclosure", () => {
  assert.match(repository, /listResearchForProtocol/);
  assert.match(schema, /research:/);
  assert.match(schema, /experiment: resultAnalysisInputSchema/);
  assert.match(schema, /analysis: generatedResultAnalysisSchema/);
  assert.match(page, /workspace\.protocol\.testCases/);
  assert.match(page, /workspace\.review\.adjustmentCount/);
});

test("guards the dynamic Report route and exposes generate, failed, running, and completed states", () => {
  assert.match(page, /getReportWorkspace/);
  assert.match(page, /redirect\(`\/projects\/\$\{projectId\}\/results`\)/);
  assert.match(page, /ReportGenerationAction/);
  assert.match(page, /上次报告未完成/);
  assert.match(page, /深度报告生成中/);
  assert.match(page, /报告已生成/);
  assert.doesNotMatch(service + repository + page + actions, /@\/lib\/mock|mockBenchmarkReport|\/projects\/demo/);
});

test("keeps Report lifecycle mutations service-role only and immutable when terminal", () => {
  assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /grant execute[\s\S]*to (?:anon|authenticated)/);
  assert.doesNotMatch(migration, /on delete cascade/i);
});
