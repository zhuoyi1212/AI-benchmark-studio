import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const [proxy, envExample, readme] = await Promise.all([
  read("proxy.ts"),
  read(".env.example"),
  read("README.md"),
]);

test("protects deployed pages, route handlers, and Server Actions behind one access gate", () => {
  assert.match(proxy, /process\.env\.APP_ACCESS_PASSWORD/);
  assert.match(proxy, /process\.env\.NODE_ENV === "production"/);
  assert.match(proxy, /status: 503/);
  assert.match(proxy, /status: 401/);
  assert.match(proxy, /WWW-Authenticate/);
  assert.match(proxy, /timingSafeEqual/);
  assert.match(proxy, /matcher: \["\/\(\(\?!_next\/static\|_next\/image\|favicon\.ico\)\.\*\)"\]/);
  assert.doesNotMatch(proxy, /ZAI_API_KEY|DEEPSEEK_API_KEY|SUPABASE_SECRET_KEY/);
});

test("documents access credentials without committing a value", () => {
  assert.match(envExample, /^APP_ACCESS_USERNAME=$/m);
  assert.match(envExample, /^APP_ACCESS_PASSWORD=$/m);
  assert.match(readme, /Vercel Project Settings/);
  assert.match(readme, /生产环境缺少 `APP_ACCESS_PASSWORD` 时整站返回 503/);
});
