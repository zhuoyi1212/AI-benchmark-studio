import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFile } from "node:fs/promises";

const projectId = process.argv[2];
if (!/^[0-9a-f-]{36}$/i.test(projectId ?? "")) {
  throw new Error("Usage: npm run verify:blind-review-start -- <existing-project-id>");
}

const localEnvironment = await readLocalEnvironment();
const supabaseUrl = process.env.SUPABASE_URL || localEnvironment.SUPABASE_URL
  || process.env.NEXT_PUBLIC_SUPABASE_URL || localEnvironment.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || localEnvironment.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !supabaseSecretKey) throw new Error("Blind Review verification requires local Supabase server credentials");

const token = randomUUID();
const port = await findAvailablePort();
const origin = `http://127.0.0.1:${port}`;
let appProcess;

try {
  appProcess = spawn(process.execPath, [
    "node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port),
  ], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      SUPABASE_URL: supabaseUrl,
      SUPABASE_SECRET_KEY: supabaseSecretKey,
      E2E_TEST_MODE: "1",
      E2E_TEST_TOKEN: token,
      AI_BENCHMARK_NEXT_DIST_DIR: ".next-e2e",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  appProcess.stdout.setEncoding("utf8").on("data", (chunk) => process.stdout.write(chunk));
  appProcess.stderr.setEncoding("utf8").on("data", (chunk) => process.stderr.write(chunk));
  await waitForServer(origin, appProcess);

  const response = await fetch(`${origin}/api/e2e-test/blind-review-start`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-e2e-token": token },
    body: JSON.stringify({ projectId }),
    signal: AbortSignal.timeout(120_000),
  });
  const result = await response.json();
  assert.equal(response.ok, true, `Blind Review startup failed: ${JSON.stringify(result)}`);
  assert.equal(result.ok, true);
  assert.ok(result.blindSampleCount > 0, "Professional Review did not create Blind Samples");
  console.log(`Blind Review startup: project ${projectId}, ${result.blindSampleCount} Blind Sample(s), no AI Provider calls`);
} finally {
  if (appProcess) await stopProcess(appProcess);
}

async function waitForServer(origin, child) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Next.js E2E server exited early (${child.exitCode ?? child.signalCode})`);
    try {
      const response = await fetch(`${origin}/api/e2e-test/blind-review-start`, { signal: AbortSignal.timeout(2_000) });
      if (response.status === 405) return;
    } catch {
      // The development server is still compiling.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Next.js Blind Review E2E server did not become ready within 90 seconds");
}

async function findAvailablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not reserve a local E2E port");
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
  return {};
}
