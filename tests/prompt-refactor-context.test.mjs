import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const context = await readFile(new URL("../docs/ai-prompt-refactor-context.md", import.meta.url), "utf8");

test("prompt refactor handoff documents the complete evidence workflow", () => {
  for (const stage of [
    "产品调研 Research",
    "测试计划 Protocol",
    "上传原始 Artifact",
    "Blind Judge 匿名评分",
    "Human Review",
    "Content Discovery",
    "提纲及初稿",
    "初稿内容核验",
    "语言润色",
    "最终保真检查",
  ]) assert.match(context, new RegExp(stage));
});

test("prompt refactor handoff preserves non-negotiable product boundaries", () => {
  for (const rule of [
    "Protocol 必须在看到实验结果前 Lock",
    "用户必须手动执行第三方产品测试",
    "AI Score immutable",
    "Findings 必须人工确认",
    "文章失败不能保存为 ready",
  ]) assert.match(context, new RegExp(rule));
});

test("prompt refactor handoff separates project modes and links source documents", () => {
  assert.match(context, /单产品与多产品/);
  assert.match(context, /快速模式与专业模式/);
  assert.match(context, /\.\/ai-prompt-inventory\.md/);
  assert.match(context, /\.\/final-content-generation-standard\.md/);
});
