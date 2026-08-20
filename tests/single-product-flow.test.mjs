import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [mode, research, protocol, judge, results, report, publish, migration, databaseTypes] = await Promise.all([
  read("lib/project-mode.ts"),
  read("lib/services/research.service.ts"),
  read("lib/services/protocols.service.ts"),
  read("lib/services/judge.service.ts"),
  read("lib/services/result-analysis.service.ts"),
  read("lib/services/report.service.ts"),
  read("lib/services/publish.service.ts"),
  read("supabase/migrations/202608180005_single_product_experience_flow.sql"),
  read("lib/types/database.ts"),
]);

test("derives single versus comparison mode from the 1-3 product project", () => {
  assert.match(mode, /products\.length === 1 \? "single" : "comparison"/);
  assert.match(research, /comparabilityDoesNotGateSingleProductExperience/);
});

test("single research can generate a 1-3 case experience protocol without weakening comparison gating", () => {
  assert.match(protocol, /projectMode === "comparison" && result\.comparability\.status === "not_comparable"/);
  assert.match(protocol, /testCaseCount >= 1 && testCaseCount <= 3/);
  assert.match(protocol, /testCaseCount >= 2 && testCaseCount <= 4/);
  assert.match(migration, /comparability->>'status' in \('comparable', 'partially_comparable'\)[\s\S]*count\(\*\).*project_products.*= 1/);
});

test("evidence requirements remain linked through Judge and ResultAnalysis", () => {
  assert.match(judge, /expectedOutputTypes/);
  assert.match(judge, /evidenceRequirements/);
  assert.match(migration, /'expectedOutputTypes', test_case\.expected_output_types/);
  assert.match(migration, /'evidenceRequirements', test_case\.evidence_requirements/);
  assert.match(databaseTypes, /expected_output_types: Json/);
  assert.match(databaseTypes, /kind: "image" \| "pdf" \| "text" \| "video"/);
});

test("single output stages use experience semantics while comparison behavior remains available", () => {
  assert.match(results, /projectMode === "single"/);
  assert.match(results, /不得使用排名、冠军或相对竞品措辞/);
  assert.match(report, /深度体验报告编辑/);
  assert.match(report, /深度测评报告编辑/);
  assert.match(publish, /我真实体验了这个 AI 产品之后发现/);
  assert.match(publish, /同一 Case 的多产品对比应连续排列/);
});

test("Publish candidates are restricted to current analysis and report evidence", () => {
  assert.match(publish, /experimentArtifactIds/);
  assert.match(publish, /report\.evidence\.filter/);
  assert.doesNotMatch(publish, /listArtifacts\(runs/);
});
