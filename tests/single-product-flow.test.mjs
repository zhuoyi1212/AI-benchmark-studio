import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [mode, research, protocol, judge, results, report, publish, migration, triggerMigration, databaseTypes] = await Promise.all([
  read("lib/project-mode.ts"),
  read("lib/services/research.service.ts"),
  read("lib/services/protocols.service.ts"),
  read("lib/services/judge.service.ts"),
  read("lib/services/result-analysis.service.ts"),
  read("lib/services/report.service.ts"),
  read("lib/services/publish.service.ts"),
  read("supabase/migrations/20260820085700_single_product_experience_flow.sql"),
  read("supabase/migrations/20260820090155_single_product_protocol_trigger_gate.sql"),
  read("lib/types/database.ts"),
]);

test("derives single versus comparison mode from the 1-3 product project", () => {
  assert.match(mode, /products\.length === 1 \? "single" : "comparison"/);
  assert.match(research, /comparabilityDoesNotGateSingleProductExperience/);
});

test("single research can generate one quick experience task without weakening comparison gating", () => {
  assert.match(protocol, /projectMode === "comparison" && result\.comparability\.status === "not_comparable"/);
  assert.match(protocol, /testCaseCount === 1/);
  assert.match(protocol, /sharedCoreCapabilitiesOnly: true/);
  assert.match(protocol, /samePromptInputAndConditions: true/);
  assert.match(migration, /comparability->>'status' in \('comparable', 'partially_comparable'\)[\s\S]*count\(\*\).*project_products.*= 1/);
  assert.match(triggerMigration, /create or replace function private\.validate_protocol_lock/);
  assert.match(triggerMigration, /comparability->>'status' in \('comparable', 'partially_comparable'\)[\s\S]*count\(\*\).*project_products.*= 1/);
});

test("evidence requirements remain linked through Judge and ResultAnalysis", () => {
  assert.match(judge, /expectedOutputTypes/);
  assert.match(judge, /evidenceRequirements/);
  assert.match(migration, /'expectedOutputTypes', test_case\.expected_output_types/);
  assert.match(migration, /'evidenceRequirements', test_case\.evidence_requirements/);
  assert.match(databaseTypes, /expected_output_types: Json/);
  assert.match(databaseTypes, /kind: "image" \| "pdf" \| "text" \| "video"/);
});

test("single-product quick flow can publish from confirmed Findings while professional analysis remains available", () => {
  assert.match(results, /projectMode === "single"/);
  assert.match(results, /不得使用排名、冠军或相对竞品措辞/);
  assert.match(report, /深度体验报告编辑/);
  assert.match(report, /深度测评报告编辑/);
  assert.match(publish, /source\.kind === "findings"/);
  assert.match(publish, /humanConfirmedFindings/);
  assert.match(publish, /source\.kind === "findings"[\s\S]*publishRepository\.beginFromFindings/);
});

test("quick Publish uses confirmed Findings and real image artifacts instead of requiring Report evidence", () => {
  assert.match(publish, /getExperienceFindingsWorkspace/);
  assert.match(publish, /quick\.artifacts/);
  assert.match(publish, /mimeType\.startsWith\("image\/"\)/);
  assert.match(publish, /事实判断以 humanConfirmedFindings 为主/);
});
