import { Buffer } from "node:buffer";
import { getBlindReviewWorkspace } from "@/lib/services/blind-review.service";
import { getHumanReviewWorkspace, lockHumanReview, revealHumanReview } from "@/lib/services/human-review.service";
import { runBlindJudge } from "@/lib/services/judge.service";
import { generateProtocol, getProtocolWorkspace, lockProtocol, ProtocolExecutionError } from "@/lib/services/protocols.service";
import { createProject, softDeleteProject } from "@/lib/services/projects.service";
import { discoverContentIdeas, generateCommunityPost, getPublishWorkspace } from "@/lib/services/publish.service";
import { generateReport, getReportWorkspace } from "@/lib/services/report.service";
import { executeProductResearch, getResearchWorkspace } from "@/lib/services/research.service";
import { generateFinalResultAnalysis, getResultsWorkspace } from "@/lib/services/result-analysis.service";
import { finalizeTestExecution, getTestExecutionWorkspace, uploadTestArtifact } from "@/lib/services/test-execution.service";

export const runtime = "nodejs";
export const maxDuration = 300;

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

export async function POST(request: Request) {
  if (!isAuthorized(request)) return new Response(null, { status: 404 });

  const body = await request.json().catch(() => null) as { runId?: unknown } | null;
  const runId = typeof body?.runId === "string" ? body.runId : "";
  if (!/^[a-z0-9-]{8,80}$/.test(runId)) {
    return Response.json({ ok: false, error: "Invalid E2E run ID" }, { status: 400 });
  }

  const projectIds: string[] = [];
  let result: Record<string, unknown>;
  let status = 200;
  let stage = "setup";

  try {
    stage = "single-product-flow";
    const single = await runSingleProductFlow(request, runId, projectIds);
    stage = "comparison-regression";
    const comparison = await runComparisonRegression(runId, projectIds);
    stage = "not-comparable-gate";
    const notComparable = await runNotComparableRegression(runId, projectIds);
    result = { ok: true, runId, single, comparison, notComparable };
  } catch (error) {
    status = 500;
    result = {
      ok: false,
      runId,
      stage,
      error: error instanceof Error ? `${error.name}: ${error.message}` : "Unknown E2E failure",
    };
  }

  const cleanup = await Promise.all(projectIds.map(async (projectId) => {
    try {
      return { projectId, archived: await softDeleteProject(projectId) };
    } catch (error) {
      return { projectId, archived: false, error: error instanceof Error ? error.message : "Unknown cleanup failure" };
    }
  }));
  const cleanupComplete = cleanup.length === projectIds.length && cleanup.every((item) => item.archived);
  if (!cleanupComplete && status === 200) status = 500;

  return Response.json({ ...result, cleanup: { complete: cleanupComplete, projects: cleanup } }, { status });
}

async function runSingleProductFlow(request: Request, runId: string, projectIds: string[]) {
  const projectId = await createProject({
    name: `[E2E] Single Product Flow ${runId}`,
    intent: "验证单产品体验从真实研究、证据评分到社区内容的完整数据链。",
    products: [{ name: `E2E Experience Product ${runId}`, officialUrl: `https://${runId}.single-e2e.example.com` }],
  });
  projectIds.push(projectId);

  await executeProductResearch(projectId);
  const research = requireValue(await getResearchWorkspace(projectId), "Single Research workspace missing");
  assert(research.completedResult?.comparability.status === "not_comparable", "Single Research must prove comparability does not gate the flow");
  assert(research.project.products.length === 1, "Single Project must contain exactly one Product");

  const protocolId = await generateProtocol(projectId);
  let protocolWorkspace = requireValue(await getProtocolWorkspace(projectId), "Single Protocol workspace missing");
  assert(protocolWorkspace.protocol?.id === protocolId, "Generated Protocol was not persisted");
  assert(protocolWorkspace.protocol.status === "draft", "Generated Protocol must begin as draft");
  assert(protocolWorkspace.protocol.testCases.length >= 1 && protocolWorkspace.protocol.testCases.length <= 3, "Single Protocol must contain 1-3 TestCases");
  assert(protocolWorkspace.protocol.testCases.every((item) => item.expectedOutputTypes.includes("image")), "Expected output types were not persisted");
  assert(protocolWorkspace.protocol.testCases.every((item) => item.evidenceRequirements.length > 0), "Evidence requirements were not persisted");

  await lockProtocol(projectId, protocolId);
  protocolWorkspace = requireValue(await getProtocolWorkspace(projectId), "Locked Protocol workspace missing");
  assert(protocolWorkspace.protocol?.status === "locked", "Protocol did not enter locked state");

  let testWorkspace = requireValue(await getTestExecutionWorkspace(projectId), "Single Test Execution workspace missing");
  assert(testWorkspace.testRuns.length === protocolWorkspace.protocol.testCases.length, "Single TestRun matrix must be 1 Product x N TestCases");
  for (const run of testWorkspace.testRuns) {
    await uploadTestArtifact({
      projectId,
      testRunId: run.id,
      file: new File([onePixelPng], `e2e-${run.id}.png`, { type: "image/png" }),
      metadata: { generationTimeSeconds: 7, retryCount: 0, manuallyEdited: false, notes: `Self-contained E2E raw Artifact ${runId}` },
    });
  }
  testWorkspace = requireValue(await getTestExecutionWorkspace(projectId), "Uploaded Test Execution workspace missing");
  const artifactIds = testWorkspace.testRuns.flatMap((run) => run.artifacts.map((artifact) => artifact.id));
  assert(artifactIds.length === testWorkspace.testRuns.length, "Every TestRun must retain one raw Artifact");
  assert(testWorkspace.testRuns.every((run) => run.projectId === projectId && run.protocolId === protocolId), "Artifact lineage left the current Project or Protocol");
  await finalizeTestExecution(projectId, protocolId);

  const blind = requireValue(await getBlindReviewWorkspace(projectId), "Single Blind workspace missing");
  assert(blind.samples.length === 1, "Single Project must retain one anonymous Sample");
  await runBlindJudge(projectId);
  let review = requireValue(await getHumanReviewWorkspace(projectId), "Single Human Review workspace missing");
  assert(review.scores.length > 0, "Judge score matrix is empty");
  assert(review.scores.every((score) => score.evidence.some((entry) => artifactIds.some((id) => entry.includes(id)))), "Judge Evidence must reference current Artifact IDs");
  await lockHumanReview(projectId, review.reviewSessionId);
  review = requireValue(await getHumanReviewWorkspace(projectId), "Locked Human Review workspace missing");
  assert(review.status === "locked", "Human Review did not lock Final Scores");
  await revealHumanReview(projectId, review.reviewSessionId);
  review = requireValue(await getHumanReviewWorkspace(projectId), "Revealed Human Review workspace missing");
  assert(review.status === "revealed" && review.revealedMappings?.length === 1, "Single identity reveal failed");

  await generateFinalResultAnalysis(projectId);
  const results = requireValue(await getResultsWorkspace(projectId), "Single Results workspace missing");
  assert(results.projectMode === "single" && results.productScores.length === 1, "Results did not retain single-product mode");
  assert(results.latestAnalysis?.status === "completed" && Boolean(results.latestAnalysis.output), "Final Result Analysis did not complete");

  await generateReport(projectId);
  const report = requireValue(await getReportWorkspace(projectId), "Single Report workspace missing");
  assert(report.projectMode === "single" && report.report?.status === "completed", "Single experience Report did not complete");
  assert(report.report.content?.title.includes("体验"), "Single Report title must use experience semantics");
  assert(new Set(report.evidence.map((item) => item.artifactId)).size === artifactIds.length, "Report evidence must retain the current Artifact lineage");

  await discoverContentIdeas(projectId);
  let publish = requireValue(await getPublishWorkspace(projectId), "Single Publish workspace missing");
  const selectedIdea = publish.pack?.ideas.find((idea) => idea.recommended) ?? publish.pack?.ideas[0];
  assert(Boolean(selectedIdea), "Content Discovery did not return an idea");
  await generateCommunityPost(projectId, {
    ideaId: selectedIdea!.id,
    config: {
      channel: "通用社区",
      goal: "分享真实体验",
      tone: "真实、克制、有观点，严格基于测试证据。",
      length: "600 字左右",
      imageCount: 1,
      interactionGoal: "邀请读者分享最看重的真实使用体验。",
    },
  });
  publish = requireValue(await getPublishWorkspace(projectId), "Completed Publish workspace missing");
  assert(publish.projectMode === "single" && publish.pack?.status === "ready", "Single Publish Pack did not complete");
  assert(publish.pack.post?.body.includes("真实体验"), "Single Publish copy must use experience semantics");
  assert(publish.pack.post?.screenshotRecommendations.every((item) => artifactIds.includes(item.artifactId)), "Publish must only reference current Artifacts");

  const routeChecks = await verifySingleRoutes(new URL(request.url).origin, projectId, report.report.content!.title, publish.pack.post!.title);
  return {
    projectId,
    comparabilityStatus: research.completedResult.comparability.status,
    protocolId,
    testCases: protocolWorkspace.protocol.testCases.map((item) => ({ id: item.id, expectedOutputTypes: item.expectedOutputTypes, evidenceRequirements: item.evidenceRequirements })),
    testRunCount: testWorkspace.testRuns.length,
    artifactIds,
    blindSampleCount: blind.samples.length,
    judgeScoreCount: review.scores.length,
    resultMode: results.projectMode,
    reportMode: report.projectMode,
    publishMode: publish.projectMode,
    routeChecks,
  };
}

async function runComparisonRegression(runId: string, projectIds: string[]) {
  const projectId = await createProject({
    name: `[E2E] Comparison Protocol ${runId}`,
    intent: "验证两个同类产品仍可执行标准化横向测评。",
    products: [
      { name: `E2E Compare A ${runId}`, officialUrl: `https://${runId}.compare-a.example.com` },
      { name: `E2E Compare B ${runId}`, officialUrl: `https://${runId}.compare-b.example.com` },
    ],
  });
  projectIds.push(projectId);
  await executeProductResearch(projectId);
  const research = requireValue(await getResearchWorkspace(projectId), "Comparison Research workspace missing");
  assert(research.completedResult?.comparability.status === "comparable", "Comparable regression did not produce comparable Research");
  const protocolId = await generateProtocol(projectId);
  const workspace = requireValue(await getProtocolWorkspace(projectId), "Comparison Protocol workspace missing");
  assert(workspace.protocol?.id === protocolId && workspace.protocol.testCases.length === 2, "Comparison Protocol must preserve multi-product TestCases");
  await lockProtocol(projectId, protocolId);
  return { projectId, productCount: research.project.products.length, comparabilityStatus: research.completedResult.comparability.status, protocolId, testCaseCount: workspace.protocol.testCases.length };
}

async function runNotComparableRegression(runId: string, projectIds: string[]) {
  const projectId = await createProject({
    name: `[E2E] Not Comparable Gate ${runId}`,
    intent: "E2E_NOT_COMPARABLE：验证两个不同类别产品不能生成横评 Protocol。",
    products: [
      { name: `E2E Writer ${runId}`, officialUrl: `https://${runId}.writer.example.com` },
      { name: `E2E Video ${runId}`, officialUrl: `https://${runId}.video.example.com` },
    ],
  });
  projectIds.push(projectId);
  await executeProductResearch(projectId);
  const research = requireValue(await getResearchWorkspace(projectId), "Not-comparable Research workspace missing");
  assert(research.completedResult?.comparability.status === "not_comparable", "Not-comparable regression did not retain its status");
  let blocked = false;
  try {
    await generateProtocol(projectId);
  } catch (error) {
    blocked = error instanceof ProtocolExecutionError && error.message.includes("不能生成 Protocol");
  }
  assert(blocked, "Two-product not_comparable Research must block Protocol generation");
  const workspace = requireValue(await getProtocolWorkspace(projectId), "Not-comparable Protocol workspace missing");
  assert(workspace.protocol === null, "Blocked comparison must not persist a Protocol");
  return { projectId, productCount: research.project.products.length, comparabilityStatus: research.completedResult.comparability.status, protocolBlocked: blocked };
}

async function verifySingleRoutes(origin: string, projectId: string, reportTitle: string, postTitle: string) {
  const checks = [
    ["research", ["体验范围判断", "核心体验能力"], []],
    ["protocol", ["已锁定"], []],
    ["test", ["测试数据已确认"], []],
    ["review", ["产品身份已揭晓"], []],
    ["results", ["产品体验结果", "综合体验得分"], ["综合冠军", "最终排名", "第一名"]],
    ["report", ["体验报告已生成", reportTitle], ["综合冠军", "最终排名", "第一名"]],
    ["publish", ["已准备好", postTitle], ["综合冠军", "最终排名", "第一名"]],
  ] as const;
  const verified: string[] = [];
  for (const [route, required, forbidden] of checks) {
    const response = await fetch(`${origin}/projects/${projectId}/${route}`, { cache: "no-store" });
    assert(response.ok, `${route} route returned ${response.status}`);
    const html = await response.text();
    for (const text of required) assert(html.includes(text), `${route} route did not render ${text}`);
    for (const text of forbidden) assert(!html.includes(text), `${route} route exposed comparison-only copy: ${text}`);
    verified.push(route);
  }
  return verified;
}

function isAuthorized(request: Request) {
  const token = process.env.E2E_TEST_TOKEN;
  return process.env.NODE_ENV !== "production"
    && process.env.E2E_TEST_MODE === "1"
    && Boolean(token)
    && request.headers.get("x-e2e-token") === token;
}

function requireValue<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
