import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { deriveWorkflowState } from "../lib/workflow-navigation-state.ts";

async function read(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function snapshot(overrides = {}) {
  return {
    projectId: "project-1",
    evaluationMode: "quick",
    productCount: 1,
    researchRuns: [],
    protocols: [],
    testCases: [],
    testRuns: [],
    artifactRunIds: [],
    judgeRuns: [],
    reviewSessions: [],
    experienceFindings: [],
    resultAnalyses: [],
    reports: [],
    publishPacks: [],
    ...overrides,
  };
}

function assertOnlyAccessible(state, expected) {
  assert.deepEqual(
    Object.entries(state.stages).filter(([, stage]) => stage.accessible).map(([id]) => id),
    expected,
  );
}

test("Case A: a new project exposes Research and locks every dependent stage", () => {
  const state = deriveWorkflowState(snapshot());
  assertOnlyAccessible(state, ["research"]);
  assert.equal(state.stages.research.completed, false);
  assert.equal(state.stages.protocol.lockedReason, "请先完成产品调研");
});

test("Case B: completed Research unlocks Protocol without guessing from project.status", () => {
  const state = deriveWorkflowState(snapshot({
    productCount: 2,
    researchRuns: [{ id: "research-1", version: 1, status: "completed", comparability: { status: "comparable" } }],
  }));
  assertOnlyAccessible(state, ["research", "protocol"]);
  assert.equal(state.stages.research.completed, true);
  assert.equal(state.stages.protocol.completed, false);
});

test("Case C: an Artifact-backed complete Test matrix remains completed while browsing earlier pages", () => {
  const state = deriveWorkflowState(snapshot({
    productCount: 2,
    researchRuns: [{ id: "research-1", version: 1, status: "completed", comparability: { status: "comparable" } }],
    protocols: [{ id: "protocol-1", researchRunId: "research-1", version: 1, status: "locked" }],
    testCases: [{ id: "case-1", protocolId: "protocol-1" }, { id: "case-2", protocolId: "protocol-1" }],
    testRuns: [1, 2, 3, 4].map((index) => ({ id: `run-${index}`, protocolId: "protocol-1", status: "ready_for_review" })),
    artifactRunIds: ["run-1", "run-2", "run-3", "run-4"],
  }));
  assertOnlyAccessible(state, ["research", "protocol", "test", "review"]);
  assert.equal(state.stages.protocol.completed, true);
  assert.equal(state.stages.test.completed, true);
  assert.equal(state.stages.results.completed, false);
  assert.equal(state.stages.review.completed, false);
});

test("Case D: a completed Publish lineage keeps all seven stages completed and accessible", () => {
  const state = deriveWorkflowState(snapshot({
    researchRuns: [{ id: "research-1", version: 1, status: "completed", comparability: { status: "not_applicable" } }],
    protocols: [{ id: "protocol-1", researchRunId: "research-1", version: 1, status: "locked" }],
    testCases: [{ id: "case-1", protocolId: "protocol-1" }],
    testRuns: [{ id: "run-1", protocolId: "protocol-1", status: "ready_for_review" }],
    artifactRunIds: ["run-1"],
    judgeRuns: [{ id: "judge-1", protocolId: "protocol-1", status: "completed" }],
    reviewSessions: [{ id: "review-1", protocolId: "protocol-1", judgeRunId: "judge-1", status: "revealed" }],
    experienceFindings: [{ id: "findings-1", protocolId: "protocol-1", status: "completed", humanConfirmedAt: "2026-09-20T00:00:00Z" }],
    resultAnalyses: [{ id: "analysis-1", reviewSessionId: "review-1", status: "completed" }],
    reports: [{ id: "report-1", resultAnalysisId: "analysis-1", status: "completed" }],
    publishPacks: [{ id: "publish-1", reportId: null, findingsId: "findings-1", status: "ready" }],
  }));
  assertOnlyAccessible(state, ["research", "protocol", "test", "review", "results", "report", "publish"]);
  assert.ok(Object.values(state.stages).every((stage) => stage.completed));
});

test("Case E: regeneration history stays reachable while new versions do not overwrite old completion", () => {
  const state = deriveWorkflowState(snapshot({
    researchRuns: [
      { id: "research-2", version: 2, status: "completed", comparability: { status: "not_applicable" } },
      { id: "research-1", version: 1, status: "completed", comparability: { status: "not_applicable" } },
    ],
    protocols: [
      { id: "protocol-2", researchRunId: "research-2", version: 2, status: "draft" },
      { id: "protocol-1", researchRunId: "research-1", version: 1, status: "locked" },
    ],
    testCases: [{ id: "case-1", protocolId: "protocol-1" }],
    testRuns: [{ id: "run-1", protocolId: "protocol-1", status: "ready_for_review" }],
    artifactRunIds: ["run-1"],
  }));
  assert.equal(state.stages.protocol.completed, true);
  assert.equal(state.stages.test.completed, true);
  assert.equal(state.stages.review.accessible, true);
  assert.equal(state.stages.results.accessible, false);
});

test("single-product Research is never blocked by comparison comparability", () => {
  const researchRuns = [{ id: "research-1", version: 1, status: "completed", comparability: { status: "not_comparable" } }];
  assert.equal(deriveWorkflowState(snapshot({ productCount: 1, researchRuns })).stages.protocol.accessible, true);
  assert.equal(deriveWorkflowState(snapshot({ productCount: 2, researchRuns })).stages.protocol.accessible, false);
});

test("historical confirmed Findings remain reachable without rewriting old lineage", () => {
  const state = deriveWorkflowState(snapshot({
    researchRuns: [{ id: "research-1", version: 1, status: "completed", comparability: { status: "not_applicable" } }],
    protocols: [{ id: "protocol-1", researchRunId: "research-1", version: 1, status: "locked" }],
    testCases: [{ id: "case-1", protocolId: "protocol-1" }],
    testRuns: [{ id: "run-1", protocolId: "protocol-1", status: "ready_for_review" }],
    artifactRunIds: ["run-1"],
    experienceFindings: [{ id: "findings-1", protocolId: "protocol-1", status: "completed", humanConfirmedAt: "2026-09-20T00:00:00Z" }],
  }));
  assert.equal(state.stages.results.completed, true);
  assert.equal(state.stages.publish.accessible, true);
  assert.equal(state.stages.review.completed, false);
  assert.equal(state.stages.report.completed, false);
});

test("quick mode never unlocks Publish from a background professional report alone", () => {
  const base = {
    researchRuns: [{ id: "research-1", version: 1, status: "completed", comparability: { status: "not_applicable" } }],
    protocols: [{ id: "protocol-1", researchRunId: "research-1", version: 1, status: "locked" }],
    testCases: [{ id: "case-1", protocolId: "protocol-1" }],
    testRuns: [{ id: "run-1", protocolId: "protocol-1", status: "ready_for_review" }],
    artifactRunIds: ["run-1"],
    judgeRuns: [{ id: "judge-1", protocolId: "protocol-1", status: "completed" }],
    reviewSessions: [{ id: "review-1", protocolId: "protocol-1", judgeRunId: "judge-1", status: "revealed" }],
    resultAnalyses: [{ id: "analysis-1", reviewSessionId: "review-1", status: "completed" }],
    reports: [{ id: "report-1", resultAnalysisId: "analysis-1", status: "completed" }],
  };
  assert.equal(deriveWorkflowState(snapshot(base)).stages.publish.accessible, false);
  assert.equal(deriveWorkflowState(snapshot({ ...base, evaluationMode: "professional" })).stages.publish.accessible, true);
});

test("the shared component derives active stage from pathname and never links locked stages", async () => {
  const component = await read("components/workflow-steps.tsx");
  assert.match(component, /usePathname\(\)/);
  assert.match(component, /step\.id === activeStep/);
  assert.match(component, /if \(step\.access\.accessible\)/);
  assert.match(component, /aria-disabled="true"/);
  assert.doesNotMatch(component, /\bcurrent\s*:/);
  assert.doesNotMatch(component, /index < activeStep/);
  assert.doesNotMatch(component, /\["review", "专业评分"\]/);
  assert.doesNotMatch(component, /\["report", "深度报告"\]/);
});

test("all seven real routes use the same persisted workflow state", async () => {
  const routes = ["research", "protocol", "test", "review", "results", "report", "publish"];
  for (const route of routes) {
    const page = await read(`app/projects/[projectId]/${route}/page.tsx`);
    assert.match(page, /getProjectWorkflowState/);
    if (route !== "publish") assert.match(page, /WorkflowSteps/);
  }
  const publishEditor = await read("app/projects/[projectId]/publish/publish-editor.tsx");
  assert.match(publishEditor, /WorkflowSteps projectId=\{workspace\.projectId\} workflowState=\{workflowState\}/);
});

test("workspace reads are side-effect free and explicit transitions create dependent stages", async () => {
  const [protocolService, testService, blindService, judgeService, humanService] = await Promise.all([
    read("lib/services/protocols.service.ts"),
    read("lib/services/test-execution.service.ts"),
    read("lib/services/blind-review.service.ts"),
    read("lib/services/judge.service.ts"),
    read("lib/services/human-review.service.ts"),
  ]);
  const testGetter = testService.slice(testService.indexOf("export async function getTestExecutionWorkspace"), testService.indexOf("export async function uploadTestArtifact"));
  const humanGetter = humanService.slice(humanService.indexOf("export async function getHumanReviewWorkspace"), humanService.indexOf("export async function overrideHumanScore"));
  assert.doesNotMatch(testGetter, /ensureMatrix|\.initialize\(/);
  assert.doesNotMatch(blindService, /\.initialize\(/);
  assert.doesNotMatch(humanGetter, /\.ensure\(/);
  assert.match(protocolService, /lockProtocol[\s\S]*testExecutionRepository\.ensureMatrix/);
  assert.doesNotMatch(testService, /blindReviewRepository/);
  assert.match(blindService, /startProfessionalReview[\s\S]*blindReviewRepository\.startProfessional/);
  assert.match(judgeService, /runBlindJudge[\s\S]*humanReviewRepository\.ensure/);
});
