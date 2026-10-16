import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const prompts = await readFile(new URL("../docs/ai-prompt-inventory.md", import.meta.url), "utf8");
const flow = await readFile(new URL("../docs/prompt-refactor-project-flow.md", import.meta.url), "utf8");
const goal = await readFile(new URL("../docs/prompt-refactor-final-goal.md", import.meta.url), "utf8");

test("three-file refactor kit contains prompts, project flow, and an open redesign goal", () => {
  assert.match(prompts, /生产提示词清单/);
  assert.match(prompts, /community-post\.v10-author-perspective/);

  for (const stage of ["产品调研", "生成测试方案", "人工执行测试", "匿名分析与人工确认", "发现内容选题", "生成社区内容"]) {
    assert.match(flow, new RegExp(stage));
  }

  assert.match(goal, /重新设计这套项目的提示词体系/);
  assert.match(goal, /不需要沿用当前提示词的表达方式/);
  assert.match(goal, /建议的新生成链路/);
});

test("final goal describes reader value without prescribing one article template", () => {
  for (const quality of ["从读者的问题出发", "有清晰的主线", "使用具体细节", "结论与证据的分量一致", "像真实作者写作", "保持事实可信"]) {
    assert.match(goal, new RegExp(quality));
  }
  assert.doesNotMatch(goal, /必须使用.{0,8}固定结构/);
});
