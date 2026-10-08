import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const [proxy, envExample, readme, home, rootLayout, autoDemoRoute, publicAutoDemoRoute] = await Promise.all([
  read("proxy.ts"),
  read(".env.example"),
  read("README.md"),
  read("app/page.tsx"),
  read("app/layout.tsx"),
  read("app/api/_e2e/auto-demos/route.ts"),
  read("app/api/e2e-test/auto-demos/route.ts"),
]);

test("keeps only the exact showcase route public and protects the workspace", () => {
  assert.match(proxy, /const PUBLIC_PATHS = new Set\(\["\/"\]\)/);
  assert.match(proxy, /PUBLIC_PATHS\.has\(request\.nextUrl\.pathname\)/);
  assert.match(proxy, /nextWithSurface\(request, "showcase"\)/);
  assert.match(proxy, /requestHeaders\.set\("x-ai-benchmark-surface", surface\)/);
  assert.match(proxy, /process\.env\.APP_ACCESS_PASSWORD/);
  assert.match(proxy, /process\.env\.NODE_ENV === "production"/);
  assert.match(proxy, /status: 503/);
  assert.match(proxy, /status: 401/);
  assert.match(proxy, /WWW-Authenticate/);
  assert.match(proxy, /timingSafeEqual/);
  assert.match(proxy, /matcher: \["\/\(\(\?!_next\/static\|_next\/image\|favicon\.ico\)\.\*\)"\]/);
  assert.doesNotMatch(proxy, /startsWith\(["']\/(projects|products|api)/);
  assert.doesNotMatch(proxy, /ZAI_API_KEY|DEEPSEEK_API_KEY|SUPABASE_SECRET_KEY/);
});

test("renders a data-free redacted showcase outside the workspace shell", () => {
  assert.match(home, /以下为脱敏演示案例/);
  assert.match(home, /href="\/projects"/);
  assert.match(home, /进入受保护工作台/);
  assert.doesNotMatch(home, /@\/lib|fetch\(|createClient|supabase|use server|<form|type="file"/i);
  assert.doesNotMatch(home, /万彩AI|懂你AI|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  assert.match(rootLayout, /x-ai-benchmark-surface/);
  assert.match(rootLayout, /isPublicShowcase \? children :/);
});

test("documents access credentials without committing a value", () => {
  assert.match(envExample, /^APP_ACCESS_USERNAME=$/m);
  assert.match(envExample, /^APP_ACCESS_PASSWORD=$/m);
  assert.match(readme, /Vercel Project Settings/);
  assert.match(readme, /公开作品展示页/);
  assert.match(readme, /受保护的工作台路由/);
});

test("keeps deployable route durations within the Vercel Hobby limit", () => {
  for (const route of [autoDemoRoute, publicAutoDemoRoute]) {
    const duration = Number(route.match(/maxDuration = (\d+)/)?.[1]);
    assert.ok(Number.isInteger(duration) && duration >= 1 && duration <= 300);
  }
});
