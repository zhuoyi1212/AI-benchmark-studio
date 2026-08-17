import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const [migration, schema, repository, service, page, actions, actionComponent, researchPage] = await Promise.all([
  read("supabase/migrations/202608170007_protocol_lifecycle.sql"),
  read("lib/ai/schemas/protocol.schemas.ts"),
  read("lib/repositories/protocols.repository.ts"),
  read("lib/services/protocols.service.ts"),
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
  assert.doesNotMatch(service, /testRuns|testArtifacts|judgeScores|finalScore/);
  assert.match(service, /generateProtocol/);
  assert.doesNotMatch(service, /glm-|deepseek-v|provider:\s*["']/);
});

test("keeps TestCase and Rubric dynamic while enforcing protocol invariants", () => {
  assert.match(schema, /testCases:[\s\S]*\.min\(1\)\.max\(12\)/);
  assert.match(schema, /rubric:[\s\S]*\.min\(2\)\.max\(12\)/);
  assert.match(schema, /Rubric weights must total exactly 100/);
  assert.match(schema, /mandatoryProtocolRuleIds/);
  assert.match(schema, /same-input/);
  assert.match(schema, /same-prompt/);
  assert.match(schema, /single-generation/);
  assert.match(schema, /no-editing/);
  assert.match(schema, /complete-upload/);
  assert.doesNotMatch(service, /商业汇报生成|长文转 PPT|数据分析 PPT|极限约束测试|内容完整性 20/);
});

test("locks only the latest version and preserves locked Protocol immutability", () => {
  assert.match(migration, /create function public\.lock_protocol/);
  assert.match(migration, /Only the latest Protocol version can be locked/);
  assert.match(migration, /set status = 'protocol_locked'/);
  assert.match(repository, /\.rpc\("lock_protocol"/);
  assert.match(actionComponent, /确认并锁定测评方案/);
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
