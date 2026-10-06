import assert from "node:assert/strict";
import test from "node:test";
import { parseStructuredJson } from "../lib/ai/structured-json.ts";

test("parses strict JSON without changing values", () => {
  assert.deepEqual(parseStructuredJson('{"body":"第一行\\n第二行","items":[1,2]}'), {
    body: "第一行\n第二行",
    items: [1, 2],
  });
});

test("normalizes a complete JSON markdown fence, raw string newlines, and trailing commas", () => {
  const value = "```json\n{\"body\":\"第一行\n第二行\",\"items\":[1,2,],}\n```";
  assert.deepEqual(parseStructuredJson(value), {
    body: "第一行\n第二行",
    items: [1, 2],
  });
});

test("rejects prose wrappers and structurally incomplete output", () => {
  assert.throws(() => parseStructuredJson('结果如下：{"ok":true}'));
  assert.throws(() => parseStructuredJson('{"body":"未结束"'));
});
