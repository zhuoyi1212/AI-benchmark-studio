import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const [migration, regenerationMigration, schema, repository, service, aiConfig, page, actions, actionComponent, researchPage, protocolView, testPage, inputRoute] = await Promise.all([
  read("supabase/migrations/202608170007_protocol_lifecycle.sql"),
  read("supabase/migrations/20260925090000_allow_protocol_regeneration_from_downstream.sql"),
  read("lib/ai/schemas/protocol.schemas.ts"),
  read("lib/repositories/protocols.repository.ts"),
  read("lib/services/protocols.service.ts"),
  read("lib/ai/config.ts"),
  read("app/projects/[projectId]/protocol/page.tsx"),
  read("app/projects/[projectId]/protocol/actions.ts"),
  read("app/projects/[projectId]/protocol/protocol-actions.tsx"),
  read("app/projects/[projectId]/research/page.tsx"),
  read("app/projects/[projectId]/protocol/protocol-view.tsx"),
  read("app/projects/[projectId]/test/page.tsx"),
  read("app/api/projects/[projectId]/protocol-inputs/[testCaseId]/[artifactNumber]/route.ts"),
]);

test("creates and exposes every required Protocol input instead of returning filename-only metadata", () => {
  assert.match(schema, /content: printableDocumentText/);
  assert.match(schema, /z\.literal\("application\/pdf"\)/);
  assert.match(service, /attachEveryRequiredInput: true/);
  assert.match(service, /不得只写文件名或要求用户自行准备/);
  assert.match(service, /maxTokens: evaluationMode === "quick" \? 4500 : 9000/);
  assert.match(protocolView, /artifact\.downloadUrl/);
  assert.match(testPage, /任务输入/);
  assert.match(inputRoute, /renderProtocolInputArtifact/);
  assert.match(inputRoute, /Content-Disposition/);
});

test("persists one complete dynamic Protocol draft atomically", () => {
  assert.match(migration, /create function public\.create_protocol_draft/);
  assert.match(migration, /insert into public\.protocols/);
  assert.match(migration, /insert into public\.test_cases/);
  assert.match(migration, /insert into public\.rubric_dimensions/);
  assert.match(migration, /coalesce\(max\(version\), 0\) \+ 1/);
  assert.match(repository, /\.rpc\("create_protocol_draft"/);
  assert.doesNotMatch(service + repository + page + actions, /@\/lib\/mock|mockProtocol|\/projects\/demo/);
});

test("allows a downstream project to return and generate a new Protocol version", () => {
  for (const status of ["testing", "reviewing", "review_locked", "completed", "reported", "published"]) {
    assert.match(regenerationMigration, new RegExp(`'${status}'`));
  }
  assert.match(regenerationMigration, /set status = 'protocol_draft'/);
  assert.doesNotMatch(regenerationMigration, /delete from public\.(protocols|test_runs|test_artifacts)/i);
  assert.match(page, /canRegenerate=\{canGenerate\}/);
  assert.match(page, /preserveHistory=\{displayedProtocol\.status === "locked"/);
  assert.match(testPage, /返回调整任务/);
  assert.match(testPage, /重新生成任务/);
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
  assert.match(service, /任何普通聊天机器人都能基本完成的泛化任务/);
  assert.match(service, /chooseOneHighestValueNativeOrDifferentiatingWorkflow: evaluationMode === "quick"/);
  assert.match(service, /真实用户可能提出并希望产品端到端完成的任务/);
  assert.match(service, /写作产品才以写作改写为核心/);
  assert.match(service, /禁止凭空发明旅行、写作、编程等无关领域/);
  assert.match(service, /关系沟通或情感产品测情境理解、沟通策略、边界与安全性/);
  assert.match(service, /Coding Agent\/AI IDE 测 repo 理解、文件与 Shell 工具、编辑、测试和 Agent\/Skill/);
  assert.match(service, /不得索取私有思维链/);
  assert.doesNotMatch(service, /DeepSeek Harness|Cursor|Claude Code|Perplexity|Midjourney|NotebookLM|Manus|Lovable|Gamma/);
  assert.match(aiConfig, /promptVersion: "protocol\.v12-quick-input-constraints"/);
  assert.match(aiConfig, /protocol:[\s\S]*reasoning: "standard"[\s\S]*repairReasoning: "standard"/);
});

test("requires explainable cases and a final generic-task quality gate", () => {
  for (const field of ["targetCapabilities", "whyThisTask", "evidenceExpected", "successCriteria"]) {
    assert.match(service, new RegExp(`"${field}"`));
  }
  for (const task of ["写文章", "写营销文案", "写邮件", "总结给定文字", "Brainstorm", "普通知识问答"]) {
    assert.match(service, new RegExp(task));
  }
  assert.match(service, /checks: taskQualityChecks/);
  assert.match(service, /deprioritizeUnlessCoreToProduct/);
  assert.match(service, /eachCaseInternallyAnswers/);
});

test("uses one focused task by default while preserving comparison fairness", () => {
  assert.match(service, /testCaseCount === 1/);
  assert.match(service, /mode: evaluationMode/);
  assert.match(service, /\? \{ default: 1, min: 1, max: 1 \}/);
  assert.match(service, /: \{ default: 3, min: 2, max: 4 \}/);
  assert.match(service, /chooseOneHighestValueNativeOrDifferentiatingWorkflow: evaluationMode === "quick"/);
  assert.match(service, /rubricCount: \{ default: 4, min: 3, max: 5/);
  assert.match(service, /everyDimensionApplicableToEveryTestCase: true/);
  assert.match(service, /每个全局 Rubric 维度都必须能依据每个 TestCase/);
  assert.match(service, /sharedCoreCapabilitiesOnly: true/);
  assert.match(service, /samePromptInputAndConditions: true/);
  assert.match(service, /excludeExclusiveCapabilities: true/);
  assert.match(service, /projectMode === "comparison" && result\.comparability\.status === "not_comparable"/);
});

test("keeps TestCase and Rubric dynamic while enforcing protocol invariants", () => {
  assert.match(schema, /testCases:[\s\S]*\.min\(1\)\.max\(4\)/);
  assert.match(schema, /rubric:[\s\S]*\.min\(3\)\.max\(5\)/);
  assert.match(schema, /Rubric weights must total exactly 100/);
  assert.match(schema, /generatedProtocolDraftContentSchema/);
  assert.match(schema, /mandatoryProtocolRuleIds/);
  assert.match(schema, /same-input/);
  assert.match(schema, /same-prompt/);
  assert.match(schema, /single-generation/);
  assert.match(schema, /no-editing/);
  assert.match(schema, /complete-upload/);
  assert.match(schema, /generatedProtocolContentSchema/);
  assert.match(schema, /omit\(\{ position: true, executionRules: true \}\)/);
  assert.match(service, /normalizeGeneratedProtocol/);
  assert.match(service, /normalizeRubricWeights/);
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

test("rejects tasks that exceed researched product input capabilities", async () => {
  const { deriveProtocolInputConstraints, validateProtocolFeasibility } = await import("../lib/protocol-feasibility.ts");
  const constraints = deriveProtocolInputConstraints([{
    productId: "product-1",
    name: "受限产品",
    initials: "XP",
    positioning: "文本助手",
    targetUsers: ["用户"],
    capabilities: ["文本问答"],
    keyFeatures: ["网页输入框"],
    limitations: ["单次提示词输入不超过 1000 个字符", "不支持上传文件"],
    officialBestPractices: [],
    inputFormats: ["文本"],
    outputFormats: ["文本"],
    sources: [],
  }]);
  assert.equal(constraints.maxPromptCharacters, 1000);
  assert.equal(constraints.supportsFileUpload, false);
  const issues = validateProtocolFeasibility([{ prompt: "测".repeat(1001), inputArtifacts: [{}] }], constraints);
  assert.deepEqual(issues.map((issue) => issue.code), ["prompt_too_long", "file_upload_unsupported"]);
  assert.match(service, /validateProtocolFeasibility\(protocol\.testCases, inputConstraints\)/);
  assert.match(service, /禁止静默截断/);
  assert.match(protocolView, /任务与产品输入能力不匹配/);
  assert.match(protocolView, /&& feasible/);
});

test("draft protocol lets the user remove unwanted test cases while retaining one", async () => {
  const [currentRepository, currentService, clientActions, view, removalMigration] = await Promise.all([
    read("lib/repositories/protocols.repository.ts"),
    read("lib/services/protocols.service.ts"),
    read("app/projects/[projectId]/protocol/protocol-actions.tsx"),
    read("app/projects/[projectId]/protocol/protocol-view.tsx"),
    read("supabase/migrations/202608170017_protocol_draft_test_case_removal.sql"),
  ]);

  assert.match(currentRepository, /removeDraftTestCase[\s\S]*remove_draft_test_case/);
  assert.match(currentService, /removeDraftTestCase[\s\S]*status !== "draft"[\s\S]*length <= 1/);
  assert.match(actions, /removeDraftTestCaseAction/);
  assert.match(clientActions, /删除任务/);
  assert.match(view, /至少保留 1 个/);
  assert.match(view, /disabled=\{protocol\.testCases\.length <= 1\}/);
  assert.match(removalMigration, /test_case_count <= 1[\s\S]*delete from public\.test_cases/);
});
