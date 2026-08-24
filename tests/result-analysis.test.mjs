import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(relativePath) { return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8"); }

const [migration, schema, repository, service, page, actions] = await Promise.all([
  read("supabase/migrations/202608170013_result_analysis_lifecycle.sql"),
  read("lib/ai/schemas/result-analysis.schemas.ts"),
  read("lib/repositories/result-analysis.repository.ts"),
  read("lib/services/result-analysis.service.ts"),
  read("app/projects/[projectId]/results/page.tsx"),
  read("app/projects/[projectId]/results/actions.ts"),
]);

test("starts Final Result Analysis only from revealed locked Final Scores", () => {
  assert.match(migration, /status = 'completed'/);
  assert.match(migration, /status = 'revealed'/);
  assert.match(migration, /private\.final_score_signature/);
  assert.match(migration, /final_score_signature/);
  assert.match(migration, /review_final_scores/);
});

test("snapshots the full revealed experiment and human review evidence", () => {
  assert.match(migration, /'testCases'/);
  assert.match(migration, /'rubric'/);
  assert.match(migration, /'scores'/);
  assert.match(migration, /'aiScore'/);
  assert.match(migration, /'finalScore'/);
  assert.match(migration, /'humanOverrideReason'/);
  assert.match(migration, /'artifacts'/);
  assert.match(migration, /'sha256'/);
  assert.match(schema, /resultAnalysisInputSchema/);
});

test("persists the centralized AI route before calling Result Analysis", () => {
  assert.match(service, /aiTaskService\.analyzeFinalResults/);
  assert.match(service, /beforeExecute: \(route\) => resultAnalysisRepository\.start/);
  assert.match(repository, /p_provider: route\.provider/);
  assert.match(repository, /p_model: route\.model/);
  assert.match(repository, /p_prompt_version: route\.promptVersion/);
  assert.doesNotMatch(service + page + actions, /deepseek-v|glm-|provider:\s*["']/);
});

test("keeps score, ranking, and winner deterministic while AI explains them", () => {
  assert.match(service, /calculateInputRanking/);
  assert.match(service, /ranking\[0\]!\.productId/);
  assert.match(service, /assertExactProducts/);
  assert.match(schema, /winnerReason/);
  assert.doesNotMatch(schema.match(/generatedResultAnalysisSchema[\s\S]*/)?.[0] ?? "", /aiScore|finalScore|rank:/);
  assert.match(service, /不得改变任何分数、排名、冠军或证据/);
  assert.match(service, /不得输出 UUID、数据库字段名或内部 ID/);
});

test("marks old analysis stale when its Final Score signature differs", () => {
  assert.match(service, /latest\.final_score_signature !== finalScoreSignature/);
  assert.match(service, /createFinalScoreSignature/);
  assert.match(migration, /current_signature := private\.final_score_signature/);
});

test("dynamic Results route is revealed-only and has explicit generate/retry states", () => {
  assert.match(page, /getResultsWorkspace/);
  assert.match(page, /redirect\(`\/projects\/\$\{projectId\}\/review`\)/);
  assert.match(page, /ResultAnalysisAction/);
  assert.match(page, /上次分析未完成/);
  assert.match(page, /评分来源 · AI Judge \+ 人工复核/);
  assert.match(service, /buildCaseEvidence/);
  assert.match(service, /sanitizePublicEvidence/);
  assert.match(page, /证据化 Case 素材/);
  assert.match(page, /item\.keyFindings/);
  assert.doesNotMatch(service + repository + page + actions, /@\/lib\/mock|mockFinalResultAnalysis|\/projects\/demo/);
});

test("keeps Result Analysis mutations service-role only", () => {
  assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /grant execute[\s\S]*to (?:anon|authenticated)/);
});
