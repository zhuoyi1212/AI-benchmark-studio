import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const [config, router, taskService, deepSeek, zhipu, providerHttp, serverEnv, envExample] = await Promise.all([
  read("lib/ai/config.ts"),
  read("lib/ai/router.ts"),
  read("lib/ai/task-service.ts"),
  read("lib/ai/providers/deepseek.provider.ts"),
  read("lib/ai/providers/zhipu.provider.ts"),
  read("lib/ai/providers/http.ts"),
  read("lib/env/server.ts"),
  read(".env.example"),
]);

test("keeps all task routing in one provider-neutral config", () => {
  assert.match(config, /research_search:[\s\S]*provider: "zhipu"/);
  assert.match(config, /comparability:[\s\S]*provider: "deepseek"/);
  assert.match(config, /judge_text:[\s\S]*provider: "deepseek"/);
  assert.match(config, /judge_multimodal:[\s\S]*provider: "zhipu"/);
  assert.match(config, /judge_multimodal:[\s\S]*reasoning: "standard"/);
  assert.match(config, /findings:[\s\S]*provider: "zhipu"[\s\S]*capability: "multimodal"/);
  assert.match(config, /report:[\s\S]*provider: "zhipu"/);
  assert.match(config, /content_discovery:[\s\S]*provider: "deepseek"/);
  assert.match(config, /community_post:[\s\S]*provider: "moonshot"[\s\S]*promptVersion: "community-post\.v15-de-ai-flavor"[\s\S]*moonshotWritingModel/);
  assert.match(config, /community_post_humanize:[\s\S]*provider: "moonshot"[\s\S]*promptVersion: "community-post-humanize\.v11-de-ai-flavor"[\s\S]*moonshotWritingModel/);
  assert.match(config, /community_post_evidence_check:[\s\S]*capability: "multimodal"[\s\S]*promptVersion: "community-post-evidence-check\.v14-de-ai-flavor-vision"[\s\S]*reasoning: "standard"[\s\S]*maxAttempts: structuredTaskMaxAttempts/);
  assert.match(config, /community_post_evidence_check_text:[\s\S]*provider: "deepseek"[\s\S]*capability: "structured_text"[\s\S]*promptVersion: "community-post-evidence-check\.v14-de-ai-flavor-text"/);
  assert.doesNotMatch(config, /community_post_(?:rewrite|critic):/);
  assert.match(config, /research:[\s\S]*reasoning: "standard"/);
  assert.match(config, /protocol:[\s\S]*reasoning: "standard"[\s\S]*repairReasoning: "standard"/);
  assert.doesNotMatch(taskService, /glm-|deepseek-v/);
  assert.match(taskService, /Product Research requires at least one source search/);
  assert.match(taskService, /Use only these retrieved sources for product facts/);
  assert.match(taskService, /generateFindings/);
  assert.match(taskService, /humanizeCommunityPost/);
  assert.match(taskService, /factCheckCommunityPost/);
});

test("routes a whole TestCase by its complete artifact modality set", () => {
  assert.match(router, /artifacts\.every\(\(artifact\) => isTextArtifactMimeType\(artifact\.mimeType\)\)/);
  for (const mimeType of ["text/plain", "text/markdown", "application/json", "text/csv"]) {
    assert.match(router, new RegExp(mimeType.replace("/", "\\/")));
  }
  assert.match(router, /artifact\.testCaseId !== testCaseId/);
  assert.doesNotMatch(router, /blindSampleId/);
});

test("normalizes and validates structured output without cross-provider fallback", () => {
  assert.match(router, /request\.schema\.safeParse\(json\)/);
  assert.match(router, /z\.toJSONSchema\(request\.schema/);
  assert.match(router, /createProvider\(route\.provider\)/);
  assert.doesNotMatch(router, /fallback|mock/i);
  assert.match(deepSeek, /reasoning_content is intentionally ignored/);
  assert.match(zhipu, /thinking fields are intentionally discarded/);
  assert.match(zhipu, /request\.reasoning === "high"/);
  assert.ok(router.indexOf("await request.beforeExecute?.(route)") < router.indexOf("provider.generateStructured"));
});

test("uses current default models and rejects retired DeepSeek aliases", () => {
  assert.match(serverEnv, /"deepseek-v4-pro"/);
  assert.match(serverEnv, /"deepseek-v4-flash"/);
  assert.match(serverEnv, /DEEPSEEK_WRITING_MODEL/);
  assert.match(serverEnv, /"glm-5\.2"/);
  assert.match(serverEnv, /"glm-4\.6v"/);
  assert.match(serverEnv, /"glm-ocr"/);
  assert.match(serverEnv, /\["deepseek-chat", "deepseek-reasoner"\]/);
});

test("uses current Z.AI endpoints and Web Search engine", () => {
  assert.match(zhipu, /https:\/\/api\.z\.ai\/api\/paas\/v4/);
  assert.match(config, /research_search:[\s\S]*"search-prime"/);
  assert.doesNotMatch(zhipu, /open\.bigmodel\.cn|search_intent|content_size/);
});

test("keeps provider credentials server-only", () => {
  assert.match(envExample, /^ZAI_API_KEY=$/m);
  assert.match(envExample, /^DEEPSEEK_API_KEY=$/m);
  assert.doesNotMatch(envExample, /^NEXT_PUBLIC_.*(?:ZAI|ZHIPU|DEEPSEEK)/m);
  assert.match(serverEnv, /^import "server-only";/);
  assert.match(deepSeek, /^import "server-only";/);
  assert.match(zhipu, /^import "server-only";/);
});

test("keeps useful provider error details while redacting credentials and signed URLs", () => {
  assert.match(providerHttp, /extractProviderError\(responseBody, apiKey\)/);
  assert.match(providerHttp, /message\.split\(apiKey\)\.join\("\[redacted\]"\)/);
  assert.match(providerHttp, /URL redacted/);
  assert.match(providerHttp, /requestImageCount/);
  assert.match(providerHttp, /requestFileCount/);
  assert.match(router, /providerCode: error\.providerCode/);
  assert.match(router, /providerMessage: error\.providerMessage/);
});
