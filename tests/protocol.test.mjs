import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const [migration, schema, repository, service, aiConfig, page, actions, actionComponent, researchPage] = await Promise.all([
  read("supabase/migrations/202608170007_protocol_lifecycle.sql"),
  read("lib/ai/schemas/protocol.schemas.ts"),
  read("lib/repositories/protocols.repository.ts"),
  read("lib/services/protocols.service.ts"),
  read("lib/ai/config.ts"),
  read("app/projects/[projectId]/protocol/page.tsx"),
  read("app/projects/[projectId]/protocol/actions.ts"),
  read("app/projects/[projectId]/protocol/protocol-actions.tsx"),
  read("app/projects/[projectId]/research/page.tsx"),
]);

test("persists one complete dynamic Protocol draft atomically", () => {
  assert.match(migration, /create function public\.create_protocol_draft/);
  assert.match(migration, /insert into public\.protocols/);
  assert.match(migration, /insert into public\.test_cases/);
  assert.match(migration, /insert into public\.rubric_dimensions/);
  assert.match(migration, /coalesce\(max\(version\), 0\) \+ 1/);
  assert.match(repository, /\.rpc\("create_protocol_draft"/);
  assert.doesNotMatch(service + repository + page + actions, /@\/lib\/mock|mockProtocol|\/projects\/demo/);
});

test("generates from the selected completed ResearchRun without test output", () => {
  assert.match(migration, /Protocol requires the selected completed and comparable ResearchRun/);
  assert.match(service, /researchRunId: result\.researchRunId/);
  assert.match(service, /projectIntent|intent: research\.project\.intent/);
  assert.match(service, /comparability: result\.comparability/);
  assert.match(service, /positioning: product\.positioning/);
  assert.match(service, /capabilities: product\.capabilities/);
  assert.match(service, /keyFeatures: product\.keyFeatures/);
  assert.match(service, /officialBestPractices: product\.officialBestPractices/);
  assert.match(service, /limitations: product\.limitations/);
  assert.match(service, /sourceType \}\) => \(\{ url, sourceType \}\)/);
  assert.doesNotMatch(service, /sources: product\.sources\.map\(\(\{[^}]*snippet/);
  assert.doesNotMatch(service, /testRuns|testArtifacts|judgeScores|finalScore/);
  assert.match(service, /generateProtocol/);
  assert.doesNotMatch(service, /glm-|deepseek-v|provider:\s*["']/);
  assert.match(service, /不得出现产品名称或品牌/);
});

test("models native product capabilities before designing realistic tasks", () => {
  for (const field of ["productType", "primaryProblem", "coreCapabilities", "differentiatingCapabilities", "realisticUseCases"]) {
    assert.match(service, new RegExp(`"${field}"`));
  }
  assert.match(service, /coreCapabilitiesCount: "3-8"/);
  assert.match(service, /普通聊天框也能基本完成且不是产品核心定位/);
  assert.match(service, /优先测试原生交互与差异化工作流/);
  assert.match(service, /真实用户目标/);
  assert.match(service, /写作产品才以写作改写为核心/);
  assert.match(service, /Coding Agent\/AI IDE 测 repo 理解、文件与 Shell 工具、编辑、测试和 Agent\/Skill/);
  assert.match(service, /不得索取私有思维链/);
  assert.doesNotMatch(service, /DeepSeek Harness|Cursor|Claude Code|Perplexity|Midjourney|NotebookLM|Manus|Lovable|Gamma/);
  assert.match(aiConfig, /promptVersion: "protocol\.v8"/);
  assert.match(aiConfig, /protocol:[\s\S]*reasoning: "standard"[\s\S]*repairReasoning: "high"/);
});

test("requires explainable cases and a final generic-task quality gate", () => {
  for (const field of ["targetCapabilities", "whyThisTask", "evidenceExpected", "successCriteria"]) {
    assert.match(service, new RegExp(`"${field}"`));
  }
  for (const task of ["写文章", "写营销文案", "写邮件", "总结给定文字", "Brainstorm", "普通知识问答"]) {
    assert.match(service, new RegExp(task));
  }
  assert.match(service, /taskQualityChecks,/);
  assert.match(service, /deprioritizeUnlessCoreToProduct/);
  assert.match(service, /eachCaseInternallyAnswers/);
});

test("deepens single-product coverage while preserving comparison fairness", () => {
  assert.match(service, /testCaseCount >= 2 && testCaseCount <= 4/);
  assert.match(service, /caseCount: \{ default: 3, min: 2, max: 4/);
  assert.match(service, /useTwoOnlyWhenFewerThanThreeDistinctTestableCoreWorkflows: true/);
  assert.match(service, /rubricCount: \{ default: 4, min: 3, max: 5/);
  assert.match(service, /sharedCoreCapabilitiesOnly: true/);
  assert.match(service, /samePromptInputAndConditions: true/);
  assert.match(service, /excludeExclusiveCapabilities: true/);
  assert.match(service, /projectMode === "comparison" && result\.comparability\.status === "not_comparable"/);
});

test("keeps TestCase and Rubric dynamic while enforcing protocol invariants", () => {
  assert.match(schema, /testCases:[\s\S]*\.min\(2\)\.max\(4\)/);
  assert.match(schema, /rubric:[\s\S]*\.min\(3\)\.max\(5\)/);
  assert.match(schema, /Rubric weights must total exactly 100/);
  assert.match(schema, /mandatoryProtocolRuleIds/);
  assert.match(schema, /same-input/);
  assert.match(schema, /same-prompt/);
  assert.match(schema, /single-generation/);
  assert.match(schema, /no-editing/);
  assert.match(schema, /complete-upload/);
  assert.match(schema, /generatedProtocolContentSchema/);
  assert.match(schema, /omit\(\{ position: true, executionRules: true \}\)/);
  assert.match(service, /normalizeGeneratedProtocol/);
  assert.match(service, /Protocol must use blind-neutral wording and omit every tested product name/);
  assert.match(service, /testMode: "standardized"/);
  assert.match(service, /position: index \+ 1/);
  assert.match(service, /executionRules: standardizedExecutionRules/);
  assert.doesNotMatch(service, /商业汇报生成|长文转 PPT|数据分析 PPT|极限约束测试|内容完整性 20/);
});

test("locks only the latest version and preserves locked Protocol immutability", () => {
  assert.match(migration, /create function public\.lock_protocol/);
  assert.match(migration, /Only the latest Protocol version can be locked/);
  assert.match(migration, /set status = 'protocol_locked'/);
  assert.match(repository, /\.rpc\("lock_protocol"/);
  assert.match(actionComponent, /确认并锁定\{experienceMode \? "体验" : "测评"\}方案/);
  assert.match(actionComponent, /需要调整时只能生成新版本/);
  assert.doesNotMatch(migration, /update public\.test_cases|update public\.rubric_dimensions|delete from public\.protocols/i);
});

test("wires the real Research to Protocol route and explicit generation failure UI", () => {
  assert.match(researchPage, /projects\/\$\{project\.id\}\/protocol/);
  assert.match(actions, /ProtocolExecutionError/);
  assert.match(actionComponent, /state\.message/);
  assert.match(page, /getProtocolWorkspace/);
  assert.match(page, /ResearchRun/);
});
