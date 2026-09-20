import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { request } from "node:http";
import { createServer } from "node:net";

const token = randomUUID();
const productsArgument = process.argv.find((value) => value.startsWith("--products="))?.slice("--products=".length);
const attemptsArgument = process.argv.find((value) => value.startsWith("--attempts="))?.slice("--attempts=".length);
const selectedProducts = (productsArgument ?? process.env.AUTO_DEMO_PRODUCTS)?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
const publishOnly = process.argv.includes("--publish-only");
const rediscover = process.argv.includes("--rediscover");
const postCountArgument = process.argv.find((value) => value.startsWith("--posts="))?.slice("--posts=".length);
const postCount = Number.parseInt(postCountArgument ?? "1", 10);
const port = await findAvailablePort();
const origin = `http://127.0.0.1:${port}`;
const logs = [];
const app = spawn(process.execPath, [
  "node_modules/next/dist/bin/next",
  "dev",
  "--webpack",
  "--hostname",
  "127.0.0.1",
  "--port",
  String(port),
], {
  cwd: new URL("..", import.meta.url),
  env: {
    ...process.env,
    AUTO_DEMO_MODE: "1",
    AUTO_DEMO_TOKEN: token,
    AUTO_DEMO_PUBLISH_ATTEMPTS: attemptsArgument ?? process.env.AUTO_DEMO_PUBLISH_ATTEMPTS ?? "3",
    AI_BENCHMARK_NEXT_DIST_DIR: ".next-auto-demo",
    NEXT_TELEMETRY_DISABLED: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

collect(app.stdout, logs);
collect(app.stderr, logs);

try {
  await waitForServer(origin, app, logs);
  const { statusCode, body } = await requestJson(`${origin}/api/e2e-test/auto-demos`, token, selectedProducts, publishOnly, rediscover, postCount);
  if (statusCode < 200 || statusCode >= 300 || !body.ok) throw new Error(`AUTO DEMO generation failed: ${JSON.stringify(body)}`);
  console.log(JSON.stringify(body, null, 2));
} catch (error) {
  const recent = logs.join("").split("\n").slice(-120).join("\n");
  if (recent) console.error(`\nNext.js AUTO DEMO logs:\n${recent}`);
  throw error;
} finally {
  await stopProcess(app);
}

function requestJson(url, authToken, products, onlyPublish, shouldRediscover, requestedPostCount) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ products, publishOnly: onlyPublish, rediscover: shouldRediscover, postCount: requestedPostCount });
    const outgoing = request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payload),
        "x-auto-demo-token": authToken,
      },
    }, (response) => {
      response.setEncoding("utf8");
      let raw = "";
      response.on("data", (chunk) => { raw += chunk; });
      response.on("end", () => {
        try {
          resolve({ statusCode: response.statusCode ?? 0, body: JSON.parse(raw) });
        } catch (error) {
          reject(new Error(`AUTO DEMO route returned invalid JSON: ${raw.slice(0, 2000)}`, { cause: error }));
        }
      });
    });
    outgoing.on("error", reject);
    outgoing.end(payload);
  });
}

async function waitForServer(origin, child, output) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited early (${child.exitCode}): ${output.join("").slice(-4000)}`);
    try {
      const response = await fetch(`${origin}/projects`, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {
      // Server is still compiling.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Next.js AUTO DEMO server did not become ready");
}

async function findAvailablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not reserve an AUTO DEMO port");
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function stopProcess(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  const exited = await Promise.race([
    new Promise((resolve) => child.once("exit", () => resolve(true))),
    new Promise((resolve) => setTimeout(() => resolve(false), 8_000)),
  ]);
  if (!exited && child.exitCode === null) child.kill("SIGKILL");
}

function collect(stream, output) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    output.push(chunk);
    if (output.length > 600) output.splice(0, output.length - 600);
  });
}
