import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const [migration, backgroundAnalysisMigration, backgroundAnalysisRepair, research, protocol, config, projectForm, projectAction, protocolPage, protocolActions, quickEvaluation, humanReview, testService, upload, findingsPage, findingsAction, productsPage] = await Promise.all([
  read("supabase/migrations/20260925101034_quick_mode_research_reuse.sql"),
  read("supabase/migrations/20260926115303_allow_background_analysis_after_publish.sql"),
  read("supabase/migrations/20260926130400_restore_result_analysis_protocol_evidence.sql"),
  read("lib/services/research.service.ts"),
  read("lib/services/protocols.service.ts"),
  read("lib/ai/config.ts"),
  read("app/projects/new/project-form.tsx"),
  read("app/projects/new/actions.ts"),
  read("app/projects/[projectId]/protocol/page.tsx"),
  read("app/projects/[projectId]/protocol/protocol-actions.tsx"),
  read("lib/services/quick-evaluation.service.ts"),
  read("lib/services/human-review.service.ts"),
  read("lib/services/test-execution.service.ts"),
  read("app/projects/[projectId]/test/quick-auto-advance.tsx"),
  read("app/projects/[projectId]/results/page.tsx"),
  read("app/projects/[projectId]/results/findings-generation-action.tsx"),
  read("app/products/page.tsx"),
]);

test("defaults projects to quick mode while preserving a professional mode", () => {
  assert.match(migration, /evaluation_mode text not null default 'quick'/);
  assert.match(projectForm, /useState<EvaluationMode>\("quick"\)/);
  assert.match(projectForm, /快速模式/);
  assert.match(projectForm, /专业模式/);
  assert.match(config, /protocol_professional:[\s\S]*protocol\.v12-professional/);
  assert.match(protocol, /evaluationMode === "quick"[\s\S]*testCases\.length === 1/);
  assert.match(protocol, /protocol\.testCases\.length >= 2 && protocol\.testCases\.length <= 4/);
});

test("reuses immutable versioned product research without refreshing stale snapshots", () => {
  assert.match(migration, /create table public\.product_research_snapshots/);
  assert.match(migration, /product_research_snapshots_are_immutable/);
  assert.match(migration, /and pr\.reused_from_snapshot = false/);
  assert.match(research, /listLatestSnapshots/);
  assert.match(research, /freshProducts = project\.products\.filter/);
  assert.match(research, /snapshotToProjectResearch/);
  assert.match(research, /stale: isSnapshotStale/);
  assert.match(research, /forceRefresh/);
  assert.match(productsPage, /资料可能过期/);
});

test("quick upload advances through Blind Judge and only pauses anomalies", () => {
  const finalize = quickEvaluation.indexOf("finalizeTestExecution");
  const blind = quickEvaluation.indexOf("startProfessionalReview", finalize);
  const judge = quickEvaluation.indexOf("runBlindJudge", blind);
  const review = quickEvaluation.indexOf("getHumanReviewWorkspace", judge);
  assert.ok(finalize >= 0 && blind > finalize && judge > blind && review > judge);
  assert.match(quickEvaluation, /review\.summary\.anomalies > 0/);
  assert.match(humanReview, /score\.confidence < 0\.8/);
  assert.match(humanReview, /evidence_risk/);
  assert.match(humanReview, /parse_risk/);
  assert.match(humanReview, /fact_risk/);
  assert.match(upload, /撤销自动开始/);
  assert.match(upload, /const \[cancelled, setCancelled\] = useState\(false\)/);
  assert.match(upload, /attemptedRef\.current/);
});

test("quick mode resumes every non-human workflow gate from the current page", () => {
  assert.doesNotMatch(projectAction, /after\(/);
  assert.match(projectAction, /setQuickPreparationStatus\(projectId, "idle"\)/);
  assert.match(projectAction, /redirect\(`\/projects\/\$\{projectId\}\/protocol`\)/);
  assert.match(protocolPage, /shouldAutoStart/);
  assert.match(protocolPage, /quickPreparation\.status === "running" && !research\.latestRun/);
  assert.match(protocolPage, /AutoPrepareQuickProtocol/);
  assert.match(protocolActions, /formRef\.current\?\.requestSubmit\(\)/);
  assert.match(findingsPage, /autoStart=\{workspace\.evaluationMode === "quick"\}/);
  assert.match(findingsAction, /if \(!autoStart \|\| attemptedRef\.current\) return/);
  assert.match(findingsAction, /formRef\.current\?\.requestSubmit\(\)/);
  assert.match(backgroundAnalysisMigration, /status in \('completed', 'reported', 'published'\)/);
  assert.match(backgroundAnalysisMigration, /'expectedOutputTypes', test_case\.expected_output_types/);
  assert.match(backgroundAnalysisMigration, /'evidenceRequirements', test_case\.evidence_requirements/);
  assert.match(backgroundAnalysisRepair, /Unable to restore Result Analysis protocol evidence fields/);
});

test("accepts Office artifacts as original evidence without expected-output gating", () => {
  for (const extension of ["docx", "xlsx", "pptx", "doc", "xls", "ppt"]) {
    assert.match(testService, new RegExp(`${extension}:`));
  }
  assert.match(testService, /kind: "document"/);
  assert.match(testService, /0xd0, 0xcf, 0x11, 0xe0/);
  assert.match(migration, /'image', 'pdf', 'text', 'video', 'document'/);
  assert.match(migration, /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/);
});
