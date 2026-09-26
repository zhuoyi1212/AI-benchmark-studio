import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { startE2EProviderMock } from "./e2e-provider-mock.mjs";

const localEnvironment = await readLocalEnvironment();
const supabaseUrl = localEnvironment.SUPABASE_URL || localEnvironment.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecretKey = localEnvironment.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !supabaseSecretKey) throw new Error("Full E2E requires Supabase server credentials in .env.local or .env");

const runId = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
const protocolOnly = process.env.E2E_PROTOCOL_ONLY === "1";
const textOnlyEvidence = process.env.E2E_TEXT_ONLY_ARTIFACTS === "1";
const realAiQuickPublish = process.env.E2E_REAL_AI_FINDINGS_PUBLISH === "1";
const realAiTasks = ["ExperienceFindings", "ContentIdeas", "CommunityPostDraft", "HumanizedCommunityPost", "EvidenceCheckedCommunityPost"];
const liveProviderKeys = {
  zhipu: process.env.ZAI_API_KEY || localEnvironment.ZAI_API_KEY,
  deepseek: process.env.DEEPSEEK_API_KEY || localEnvironment.DEEPSEEK_API_KEY,
};
if (realAiQuickPublish && Object.values(liveProviderKeys).some((value) => !value)) {
  throw new Error("Real AI Findings → Publish E2E requires both configured provider credentials");
}
if (realAiQuickPublish && protocolOnly) throw new Error("Real AI Findings → Publish E2E requires the full-flow scenario");
const token = randomUUID();
const providerMock = await startE2EProviderMock({
  realAiTasks: realAiQuickPublish ? realAiTasks : [],
  providerApiKeys: realAiQuickPublish ? liveProviderKeys : {},
});
const appPort = await findAvailablePort();
const appOrigin = `http://127.0.0.1:${appPort}`;
const logs = [];
let appProcess;
let fullFlowRequestStarted = false;
let fullFlowResponseReceived = false;

try {
  appProcess = spawn(process.execPath, [
    "node_modules/next/dist/bin/next",
    "dev",
    "--webpack",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(appPort),
  ], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      AI_E2E_PROVIDER_BASE_URL: providerMock.baseUrl,
      E2E_TEST_MODE: "1",
      E2E_TEST_TOKEN: token,
      ZAI_API_KEY: realAiQuickPublish ? liveProviderKeys.zhipu : "e2e-provider-key-not-a-secret",
      DEEPSEEK_API_KEY: realAiQuickPublish ? liveProviderKeys.deepseek : "e2e-provider-key-not-a-secret",
      AI_BENCHMARK_NEXT_DIST_DIR: ".next-e2e",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  collectLogs(appProcess.stdout, logs, process.stdout);
  collectLogs(appProcess.stderr, logs, process.stderr);
  await waitForServer(appOrigin, appProcess, logs);

  fullFlowRequestStarted = true;
  const response = await fetch(`${appOrigin}/api/e2e-test/full-flow`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-e2e-token": token },
    body: JSON.stringify({ runId, protocolOnly, textOnlyEvidence }),
    signal: AbortSignal.timeout(360_000),
  });
  const result = await response.json();
  fullFlowResponseReceived = true;
  assert.equal(response.ok, true, `Full route E2E failed: ${JSON.stringify(result)}`);
  assert.equal(result.ok, true);
  assert.equal(result.single.comparabilityStatus, "not_comparable");
  assert.ok(result.single.testCases.every((item) => item.expectedOutputTypes.includes(textOnlyEvidence ? "text" : "image") && item.evidenceRequirements.length > 0));
  if (protocolOnly) {
    assert.equal(result.single.protocolOnly, true);
    assert.equal(result.single.testCases.length, 1);
    assert.ok(result.single.rubricCount >= 3 && result.single.rubricCount <= 5);
  } else {
    assert.equal(result.single.resultMode, "single");
    assert.equal(result.single.reportMode, "single");
    assert.equal(result.single.publishMode, "single");
    assert.equal(result.single.findingsConfirmed, true);
    assert.equal(result.single.quickPublishSourceType, "findings");
    assert.equal(result.single.quickPublishReady, true);
    assert.deepEqual(result.single.routeChecks, ["research", "protocol", "test", "review", "results", "report", "publish"]);
    assert.ok(result.single.artifactIds.length > 0 && result.single.judgeScoreCount > 0);
    if (textOnlyEvidence) assert.equal(result.single.publishScreenshotCount, 0);
  }
  assert.equal(result.comparison.productCount, 2);
  assert.equal(result.comparison.comparabilityStatus, "comparable");
  assert.equal(result.comparison.testCaseCount, 1);
  assert.equal(result.notComparable.productCount, 2);
  assert.equal(result.notComparable.comparabilityStatus, "not_comparable");
  assert.equal(result.notComparable.protocolBlocked, true);
  assert.equal(result.cleanup.complete, true);

  const providerStats = providerMock.stats();
  const expectedTasks = protocolOnly
    ? ["research_search", "ProductResearch", "ComparabilityResult", "ProtocolContent"]
    : ["research_search", "ProductResearch", "ComparabilityResult", "ProtocolContent", "ExperienceFindings", "ContentIdeas", "CommunityPostDraft", "HumanizedCommunityPost", "EvidenceCheckedCommunityPost", "JudgeCaseScores", "FinalResultAnalysis", "BenchmarkReport"];
  for (const task of expectedTasks) {
    assert.ok(providerStats.taskCounts[task] > 0, `Provider boundary did not receive ${task}`);
  }
  if (!protocolOnly) {
    if (realAiQuickPublish) {
      for (const task of realAiTasks) {
        assert.ok(providerStats.realAiTaskCounts[task] > 0, `${task} did not reach a real AI provider`);
      }
    } else {
      assert.equal(providerStats.taskCounts.ExperienceFindings, 1, "Quick Findings must run once");
      assert.equal(providerStats.taskCounts.ContentIdeas, 1, "Quick Content Discovery must run once");
      assert.equal(providerStats.taskCounts.CommunityPostDraft, 1, "Quick Community Post must generate one initial draft");
      assert.equal(providerStats.taskCounts.HumanizedCommunityPost, 1, "Quick Community Post must run one language naturalization pass");
      assert.equal(providerStats.taskCounts.EvidenceCheckedCommunityPost, 1, "Quick Community Post must run one evidence check");
    }
    if (textOnlyEvidence) assert.equal(providerStats.multimodalJudgeRequests, 0, "Text artifacts must stay on the text Judge route");
    else assert.ok(providerStats.multimodalJudgeRequests > 0, "Multimodal Judge did not receive the original image Artifact");
  }
  assertProtocolScenario(providerStats.protocolAttempts);

  const supabase = createClient(supabaseUrl, supabaseSecretKey, { auth: { persistSession: false } });
  const projectIds = result.cleanup.projects.map((item) => item.projectId);
  const { data: archivedProjects, error: cleanupError } = await supabase.from("projects")
    .select("id,name,deleted_at")
    .in("id", projectIds);
  if (cleanupError) throw new Error(`Fixture cleanup verification failed (${cleanupError.code})`);
  assert.equal(archivedProjects.length, projectIds.length);
  assert.ok(archivedProjects.every((project) => project.deleted_at && project.name.includes(runId)));

  console.log(`Run: ${runId}`);
  if (protocolOnly) {
    console.log(`Single Protocol: ${result.single.testCases.length} TestCase(s), ${result.single.rubricCount} Rubric dimension(s)`);
  } else {
    console.log(`Single flow: ${result.single.testRunCount} TestRun(s), ${result.single.artifactIds.length} Artifact(s), ${result.single.judgeScoreCount} JudgeScore(s)`);
    console.log(`Single routes: ${result.single.routeChecks.join(" → ")}`);
  }
  console.log(`Comparison regression: comparable Protocol with ${result.comparison.testCaseCount} TestCases`);
  console.log("Not-comparable regression: Protocol correctly blocked");
  console.log(`Provider boundary: ${providerStats.total} request(s), ${providerStats.multimodalJudgeRequests} multimodal Judge request(s)`);
  if (realAiQuickPublish) {
    console.log(`Real AI Findings → Publish calls: ${realAiTasks.map((task) => `${task}=${providerStats.realAiTaskCounts[task]}`).join(", ")}`);
  }
  console.log(`Protocol attempts: ${providerStats.protocolAttempts.map((item) => `${item.attempt}:${item.reasoning}:${item.outcome}:${item.finishReason ?? "null"}`).join(", ")}`);
  console.log(`Cleanup: ${archivedProjects.length}/${projectIds.length} temporary Projects soft-deleted`);
  console.log(protocolOnly
    ? "Create → Research → Protocol plus comparison/not-comparable regressions: verified"
    : "Create → Research → Protocol → TestRun/Artifact → Quick Findings → Confirm → Publish → optional Professional Review → Results → Report: verified");
} finally {
  try {
    if (appProcess && fullFlowRequestStarted && !fullFlowResponseReceived
      && appProcess.exitCode === null && appProcess.signalCode === null) {
      console.warn("Full-flow request ended before a response; allowing server-side cleanup 30 seconds to finish.");
      await new Promise((resolve) => setTimeout(resolve, 30_000));
    }
    if (appProcess) await stopProcess(appProcess);
  } finally {
    await providerMock.close();
  }
}

async function waitForServer(origin, child, output) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js E2E server exited early (${child.exitCode}): ${output.join("").slice(-4000)}`);
    try {
      const response = await fetch(`${origin}/projects`, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {
      // Development server is still compiling.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Next.js E2E server did not become ready: ${output.join("").slice(-4000)}`);
}

async function findAvailablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not reserve an E2E application port");
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  signalProcessTree(child, "SIGTERM");
  if (await waitForExit(child, 8_000)) return;
  signalProcessTree(child, "SIGKILL");
  if (!await waitForExit(child, 5_000)) throw new Error("Next.js E2E server did not exit after SIGKILL");
}

function signalProcessTree(child, signal) {
  if (process.platform !== "win32" && child.pid) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ESRCH") return;
      throw error;
    }
  }
  child.kill(signal);
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = (exited) => {
      clearTimeout(timer);
      child.off("exit", onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("exit", onExit);
  });
}

function collectLogs(stream, output, destination) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    output.push(chunk);
    destination.write(chunk);
    if (output.length > 400) output.splice(0, output.length - 400);
  });
}

function assertProtocolScenario(protocolAttempts) {
  const scenario = process.env.E2E_PROTOCOL_RESPONSE_SCENARIO ?? "normal";
  const expectedOutcomes = {
    "empty-then-success": ["empty_response", "success"],
    "truncated-then-success": ["truncated_response", "success"],
    "invalid-json-then-success": ["invalid_json", "success"],
    "schema-invalid-then-success": ["schema_validation", "success"],
  }[scenario];
  if (!expectedOutcomes) {
    assert.equal(protocolAttempts[0]?.reasoning, "standard");
    return;
  }
  const attempts = protocolAttempts.slice(0, 2);
  assert.deepEqual(attempts.map((item) => item.outcome), expectedOutcomes);
  const expectedReasoning = scenario === "empty-then-success"
    ? ["standard", "standard"]
    : ["standard", "high"];
  assert.deepEqual(attempts.map((item) => item.reasoning), expectedReasoning);
}

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
    const value = line.trim();
    if (!value || value.startsWith("#")) return [];
    const index = value.indexOf("=");
    if (index < 1) return [];
    return [[value.slice(0, index).trim(), value.slice(index + 1).trim().replace(/^(['"])(.*)\1$/, "$2")]];
  }));
}

async function readLocalEnvironment() {
  for (const file of [".env.local", ".env"]) {
    try {
      return parseEnv(await readFile(new URL(`../${file}`, import.meta.url), "utf8"));
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
  }
  throw new Error("Full E2E requires Supabase server credentials in .env.local or .env");
}
