import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
assert.ok(tracked.length > 0, "No tracked files found");
assert.deepEqual(tracked.filter((path) => /(^|\/)\.env(?:\.|$)/.test(path) && path !== ".env.example"), [], "A local environment file is tracked");

const textFiles = new Map();
for (const path of tracked) {
  const bytes = await readFile(new URL(path, root));
  if (!bytes.includes(0)) textFiles.set(path, bytes.toString("utf8"));
}

const envText = await readFile(new URL(".env.local", root), "utf8").catch(() => "");
const env = parseEnv(envText);
for (const key of ["ZAI_API_KEY", "DEEPSEEK_API_KEY", "MOONSHOT_API_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
  const secret = env[key];
  if (!secret || secret.length < 16) continue;
  assert.deepEqual([...textFiles].filter(([, text]) => text.includes(secret)).map(([path]) => path), [], `${key} leaked into a tracked file`);
}

const realBoundary = [...textFiles].filter(([path]) => path.startsWith("app/projects/[projectId]/") || path.startsWith("lib/services/") || path.startsWith("lib/repositories/"));
const mockPattern = /@\/lib\/mock|mockResearchResponse|mockProtocol|mockJudgeResults|mockFinalResultAnalysis|mockBenchmarkReport|mockCommunityPost/;
assert.deepEqual(realBoundary.filter(([, text]) => mockPattern.test(text)).map(([path]) => path), [], "Real flow imports Mock data");

const providerSpecificPattern = /\b(?:callGlm|callDeepSeek|OpenAIClient|OpenAIService|openaiProvider)\b|\b(?:glm-|deepseek-v|kimi-)\w*/i;
assert.deepEqual(realBoundary.filter(([, text]) => providerSpecificPattern.test(text)).map(([path]) => path), [], "Business layer depends on a provider or model");

const clientSecretPattern = /@\/lib\/(?:env\/server|supabase\/server)|\b(?:ZAI_API_KEY|DEEPSEEK_API_KEY|MOONSHOT_API_KEY|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY)\b/;
const clientLeaks = [...textFiles].filter(([, text]) => /^\s*["']use client["'];/m.test(text) && clientSecretPattern.test(text)).map(([path]) => path);
assert.deepEqual(clientLeaks, [], "Client module imports server credentials");

const example = textFiles.get(".env.example") ?? "";
for (const key of ["ZAI_API_KEY", "DEEPSEEK_API_KEY", "MOONSHOT_API_KEY", "SUPABASE_SECRET_KEY"]) {
  assert.match(example, new RegExp(`^${key}=$`, "m"), `${key} must be name-only in .env.example`);
}

console.log(`Tracked files scanned: ${tracked.length}`);
console.log(`Real flow files audited: ${realBoundary.length}`);
console.log("Secrets, client boundary, provider neutrality, and Mock boundary: verified");

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
    const value = line.trim();
    if (!value || value.startsWith("#")) return [];
    const index = value.indexOf("=");
    if (index < 1) return [];
    return [[value.slice(0, index).trim(), value.slice(index + 1).trim().replace(/^(['"])(.*)\1$/, "$2")]];
  }));
}
