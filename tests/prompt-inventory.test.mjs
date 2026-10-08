import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const config = await readFile(new URL("../lib/ai/config.ts", import.meta.url), "utf8");
const inventory = await readFile(new URL("../docs/ai-prompt-inventory.md", import.meta.url), "utf8");

test("documents every production Prompt Version", () => {
  const versions = [...config.matchAll(/promptVersion:\s*"([^"]+)"/g)].map((match) => match[1]);
  assert.ok(versions.length >= 16);
  for (const version of versions) assert.match(inventory, new RegExp(`\\b${version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`));
});

test("documents shared structured-output and repair prompts", () => {
  assert.match(inventory, /Return exactly one valid JSON object for schema/);
  assert.match(inventory, /Previous response was truncated at the provider output limit/);
  assert.match(inventory, /Correct the previous output to satisfy these validation issues/);
});

test("separates the four community article stages and title refresh", () => {
  for (const heading of ["提纲与初稿请求", "初稿内容核验", "语言润色", "最终保真检查", "单独刷新标题"]) {
    assert.match(inventory, new RegExp(`### 9\\.\\d+ ${heading}`));
  }
});
