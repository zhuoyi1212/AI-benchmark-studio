import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const [proxy, envExample, readme, rootLayout, appShell, workspaceAccess, projectsPage, projectActions, productsPage, productActions, productDetailPage, recentProjectNav, protocolPage, adminPage, autoDemoRoute, publicAutoDemoRoute] = await Promise.all([
  read("proxy.ts"),
  read(".env.example"),
  read("README.md"),
  read("app/layout.tsx"),
  read("components/app-shell.tsx"),
  read("components/workspace-access.tsx"),
  read("app/projects/page.tsx"),
  read("app/projects/project-card-actions.tsx"),
  read("app/products/page.tsx"),
  read("app/products/product-actions.tsx"),
  read("app/products/[productId]/page.tsx"),
  read("components/recent-project-nav.tsx"),
  read("app/projects/[projectId]/protocol/page.tsx"),
  read("app/admin/page.tsx"),
  read("app/api/_e2e/auto-demos/route.ts"),
  read("app/api/e2e-test/auto-demos/route.ts"),
]);

test("allows public page reads while keeping every write and internal route behind the access gate", () => {
  assert.match(proxy, /process\.env\.APP_ACCESS_PASSWORD/);
  assert.match(proxy, /process\.env\.NODE_ENV === "production"/);
  assert.match(proxy, /request\.method !== "GET" && request\.method !== "HEAD"/);
  assert.match(proxy, /pathname\.startsWith\("\/api\/"\)/);
  assert.match(proxy, /pathname === "\/projects\/new"/);
  assert.match(proxy, /pathname\.startsWith\("\/projects\/demo"\)/);
  assert.match(proxy, /pathname\.startsWith\("\/settings"\)/);
  assert.match(proxy, /pathname === "\/products" && request\.nextUrl\.searchParams\.get\("view"\) === "deleted"/);
  assert.match(proxy, /\/projects\\\/\[\^\/\]\+\\\/settings/);
  assert.match(proxy, /nextWithAccess\(request, "read-only"\)/);
  assert.match(proxy, /nextWithAccess\(request, "admin"\)/);
  assert.match(proxy, /requestHeaders\.set\(ACCESS_HEADER, access\)/);
  assert.match(proxy, /response\.headers\.set\("Vary", "Authorization"\)/);
  assert.match(proxy, /status: 503/);
  assert.match(proxy, /status: 401/);
  assert.match(proxy, /WWW-Authenticate/);
  assert.match(proxy, /timingSafeEqual/);
  assert.match(proxy, /matcher: \["\/\(\(\?!_next\/static\|_next\/image\|favicon\.ico\)\.\*\)"\]/);
  assert.doesNotMatch(proxy, /ZAI_API_KEY|DEEPSEEK_API_KEY|SUPABASE_SECRET_KEY/);
});

test("marks public page renders as read-only and provides a protected administrator entry", () => {
  assert.match(rootLayout, /x-ai-benchmark-access/);
  assert.match(rootLayout, /readOnly=\{readOnly\}/);
  assert.match(appShell, /只读浏览/);
  assert.match(appShell, /href="\/admin"/);
  assert.match(appShell, /管理员登录/);
  assert.match(appShell, /WorkspaceAccessProvider readOnly=\{readOnly\}/);
  assert.match(appShell, /data-workspace-access=\{readOnly \? "read-only" : "admin"\}/);
  assert.match(adminPage, /redirect\("\/projects"\)/);
});

test("hides administrator controls from the public read-only interface", () => {
  assert.match(workspaceAccess, /createContext\(true\)/);
  assert.match(workspaceAccess, /export function AdminOnly/);
  assert.match(projectsPage, /<AdminOnly><Button asChild><Link href="\/projects\/new"/);
  assert.match(projectActions, /useWorkspaceReadOnly/);
  assert.match(projectActions, /if \(readOnly\) return null/);
  assert.match(productsPage, /<AdminOnly><Link href="\/products\?view=deleted"/);
  assert.match(productsPage, /<AdminOnly><Link href=\{`\/projects\/new\?productId=/);
  assert.match(productActions, /useWorkspaceReadOnly/);
  assert.match(productActions, /if \(readOnly\) return null/);
  assert.match(productDetailPage, /action=\{<AdminOnly>/);
  assert.match(recentProjectNav, /<AdminOnly><SidebarLink href="\/projects\/new"/);
  assert.match(protocolPage, /<AdminOnly><Button variant="outline" size="sm" asChild><Link href=\{`\/projects\/\$\{projectId\}\/settings`\}/);
});

test("documents access credentials without committing a value", () => {
  assert.match(envExample, /^APP_ACCESS_USERNAME=$/m);
  assert.match(envExample, /^APP_ACCESS_PASSWORD=$/m);
  assert.match(readme, /Vercel Project Settings/);
  assert.match(readme, /公开只读/);
  assert.match(readme, /写操作与内部入口/);
});

test("keeps deployable route durations within the Vercel Hobby limit", () => {
  for (const route of [autoDemoRoute, publicAutoDemoRoute]) {
    const duration = Number(route.match(/maxDuration = (\d+)/)?.[1]);
    assert.ok(Number.isInteger(duration) && duration >= 1 && duration <= 300);
  }
});
