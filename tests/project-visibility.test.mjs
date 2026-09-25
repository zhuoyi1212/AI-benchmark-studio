import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isInternalValidationProject } from "../lib/project-visibility.ts";

test("recognizes internal validation projects without hiding real evaluations", () => {
  assert.equal(isInternalValidationProject({ name: "[E2E] Single Product Flow run-1234" }), true);
  assert.equal(isInternalValidationProject({ name: "快速模式复用验证 20260925" }), true);
  assert.equal(isInternalValidationProject({ name: "AUTO DEMO · ChatGPT · 通用 AI Assistant" }), true);
  assert.equal(isInternalValidationProject({ name: "豆包" }), false);
  assert.equal(isInternalValidationProject({ name: "秘塔AI搜索" }), false);
});

test("customer navigation hides Benchmark while internal demos retain explicit access", async () => {
  const [shell, service, demos] = await Promise.all([
    readFile(new URL("../components/app-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/services/projects.service.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/_e2e/auto-demos/route.ts", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(shell, /label:\s*"Benchmark"/);
  assert.match(service, /includeInternal/);
  assert.match(service, /isInternalValidationProject/);
  assert.match(demos, /listProjectSummaries\(\{ includeInternal: true \}\)/);
});
