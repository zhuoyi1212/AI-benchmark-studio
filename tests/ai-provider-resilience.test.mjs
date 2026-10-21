import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [errors, http, completion, router, config, protocolService, protocolRepository, protocolMigration, actions, actionComponent, view, button, providerMock] = await Promise.all([
  read("lib/ai/errors.ts"),
  read("lib/ai/providers/http.ts"),
  read("lib/ai/providers/completion-response.ts"),
  read("lib/ai/router.ts"),
  read("lib/ai/config.ts"),
  read("lib/services/protocols.service.ts"),
  read("lib/repositories/protocols.repository.ts"),
  read("supabase/migrations/202608170007_protocol_lifecycle.sql"),
  read("app/projects/[projectId]/protocol/actions.ts"),
  read("app/projects/[projectId]/protocol/protocol-actions.tsx"),
  read("app/projects/[projectId]/protocol/protocol-view.tsx"),
  read("components/ui/button.tsx"),
  read("scripts/e2e-provider-mock.mjs"),
]);

test("classifies provider failures without exposing request secrets", () => {
  assert.match(errors, /status === 408[\s\S]*"timeout"/);
  assert.match(errors, /status === 429[\s\S]*"rate_limit"/);
  assert.match(errors, /status >= 500[\s\S]*"provider_5xx"/);
  assert.match(errors, /status === 401 \|\| status === 403[\s\S]*"authentication"/);
  assert.match(errors, /status === 402[\s\S]*"payment_required"/);
  assert.match(errors, /return "bad_request"/);
  assert.match(http, /error\.name === "TimeoutError" \|\| error\.name === "AbortError"/);
  assert.match(http, /response body could not be read[\s\S]*isTimeoutError\(error\) \? "timeout" : "network"/);
  assert.match(http, /UND_ERR_CONNECT_TIMEOUT/);
  assert.match(http, /category: "invalid_json_body"/);
  assert.match(http, /responseContentType/);
  assert.match(http, /responseBodyLength: responseBody\.length/);
  const providerLog = router.slice(router.indexOf("function logAIProviderError"), router.indexOf("function logAIValidationError"));
  assert.doesNotMatch(providerLog, /apiKey|messages|prompt|response\.content/);
});

test("normalizes completion finish reason and separates envelope, empty, and truncated responses", () => {
  assert.match(completion, /finish_reason: z\.string\(\)\.nullable\(\)\.optional\(\)/);
  assert.match(completion, /isTruncatedFinishReason\(finishReason\)[\s\S]*"truncated_response"/);
  assert.match(completion, /finishReason === "length" \|\| finishReason === "max_tokens" \|\| finishReason === "max_output_tokens"/);
  assert.match(completion, /!content\?\.trim\(\)[\s\S]*"empty_response"/);
  assert.match(completion, /!parsed\.success[\s\S]*"invalid_envelope"/);
  assert.match(completion, /finishReason,[\s\S]*requestId:[\s\S]*usage/);
  assert.match(router, /\[AIStructuredTaskSuccess\][\s\S]*finishReason:[\s\S]*inputTokens:[\s\S]*outputTokens:/);
  assert.match(providerMock, /finish_reason: finishReason/);
});

test("uses a bounded task-specific timeout and retry budget", () => {
  assert.match(config, /standardTimeoutMs = 90_000/);
  assert.match(config, /reasoningHeavyTimeoutMs = 120_000/);
  assert.match(config, /judgeTextTimeoutMs = 300_000/);
  assert.match(config, /structuredTaskMaxAttempts = 2/);
  assert.match(config, /judgeTaskMaxAttempts = 3/);
  assert.match(config, /protocol:[\s\S]*timeoutMs: reasoningHeavyTimeoutMs/);
  assert.match(config, /judge_text:[\s\S]*timeoutMs: judgeTextTimeoutMs[\s\S]*maxAttempts: judgeTaskMaxAttempts/);
  assert.match(config, /result_analysis:[\s\S]*timeoutMs: reasoningHeavyTimeoutMs/);
  assert.match(config, /content_discovery:[\s\S]*reasoning: "standard"[\s\S]*repairReasoning: "high"[\s\S]*timeoutMs: reasoningHeavyTimeoutMs/);
  assert.match(router, /request\.maxAttempts \?\? route\.maxAttempts, route\.maxAttempts/);
  assert.match(router, /timeoutMs: route\.timeoutMs/);
});

test("retries only transient provider failures with exponential backoff and jitter", () => {
  assert.match(errors, /category === "timeout"[\s\S]*category === "rate_limit"[\s\S]*category === "provider_5xx"[\s\S]*category === "network"[\s\S]*category === "empty_response"[\s\S]*category === "truncated_response"/);
  assert.doesNotMatch(errors.slice(errors.indexOf("function isRetryableProviderCategory")), /category === "invalid_envelope"|category === "invalid_json_body"/);
  assert.match(router, /error\.retryable && attempt < maxAttempts/);
  assert.match(router, /800 \* \(2 \*\* Math\.max\(0, failedAttempt - 1\)\)/);
  assert.match(router, /Math\.random\(\) \* 400/);
  assert.match(router, /logAIProviderError\(error, attemptReasoning, maxAttempts, retryDelayMs\);[\s\S]*await delay\(retryDelayMs\)/);
  assert.match(router, /status:[\s\S]*timeout:[\s\S]*attempt:[\s\S]*latencyMs:[\s\S]*errorCategory/);
});

test("performs one bounded JSON or schema repair retry with safe validation issues", () => {
  assert.match(errors, /AIValidationErrorCategory = "invalid_json" \| "schema_validation"/);
  assert.match(errors, /readonly issues: AIValidationIssue\[\]/);
  assert.match(router, /validated\.error\.issues\.slice\(0, 8\)/);
  assert.match(router, /category: "invalid_json"/);
  assert.match(router, /Previous response was not valid JSON/);
  assert.match(router, /Correct the previous output to satisfy these validation issues/);
  assert.match(router, /Keep content unchanged except where the validation issues require a correction/);
  assert.match(router, /role: "assistant", content: previousContent/);
  assert.match(router, /attempt < maxAttempts/);
  assert.match(router, /attemptReasoning = route\.repairReasoning/);
  assert.match(providerMock, /invalid-json-then-success/);
  assert.match(providerMock, /schema-invalid-then-success/);
  assert.match(providerMock, /requireRepairInstruction\(messages, "rubric"\)/);
});

test("returns distinct safe Protocol messages for timeout, 429, 5xx, auth, and schema validation", () => {
  assert.match(protocolService, /耗时超过限制，已重试但仍未成功/);
  assert.match(protocolService, /请求较多，已重试但仍未成功/);
  assert.match(protocolService, /服务暂时异常，已重试但仍未成功/);
  assert.match(protocolService, /服务配置异常，请检查服务端配置/);
  assert.match(protocolService, /AI 已返回结果，但方案结构校验失败/);
  assert.match(protocolService, /AI 服务返回了空结果，请重新尝试/);
  assert.match(protocolService, /因长度限制被截断/);
  assert.match(protocolService, /AI 服务返回格式异常/);
  assert.match(protocolService, /AI 服务返回了无法解析的响应/);
  assert.match(protocolService, /\[ProtocolGenerationFailure\]/);
  assert.doesNotMatch(actions, /AIProviderError|AIValidationError|apiKey|prompt/i);
});

test("failed regeneration cannot replace or partially create the existing Protocol", () => {
  const generateIndex = protocolService.indexOf("const generated = await generationTask");
  const validationIndex = protocolService.indexOf("assertProtocolFitsMode", generateIndex);
  const createIndex = protocolService.indexOf("protocolsRepository.createDraft", validationIndex);
  assert.ok(generateIndex > 0 && validationIndex > generateIndex && createIndex > validationIndex);
  assert.match(protocolRepository, /\.rpc\("create_protocol_draft"/);
  assert.match(protocolMigration, /insert into public\.protocols[\s\S]*insert into public\.test_cases[\s\S]*insert into public\.rubric_dimensions/);
  assert.doesNotMatch(protocolService.slice(0, createIndex), /protocolsRepository\.(?:delete|update|lock)/);
});

test("regenerate remains readable and single-product copy avoids comparison semantics", () => {
  assert.match(actionComponent, /border-slate-300 bg-white text-slate-950/);
  assert.match(actionComponent, /hover:bg-slate-100 hover:text-slate-950/);
  assert.match(actionComponent, /disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-70/);
  assert.match(actionComponent, /disabled=\{pending\}/);
  assert.match(actionComponent, /LoaderCircle[\s\S]*正在快速生成\.\.\./);
  assert.match(actionComponent, /RefreshCw[\s\S]*重新生成新版本/);
  assert.match(actionComponent, /!pending && state\.message/);
  assert.match(button, /outline: "border bg-white hover:bg-accent"/);
  assert.match(view, /测试计划检查通过/);
  assert.match(view, /快速测评主线/);
  assert.match(view, /详细 Rubric/);
  assert.match(view, /评分 Rubric/);
});

test("Protocol input omits raw Research snippets and JSON mode stays explicit", () => {
  assert.match(protocolService, /sources: product\.sources\.map\(\(\{ url, sourceType \}\) => \(\{ url, sourceType \}\)\)/);
  assert.doesNotMatch(protocolService, /sources: product\.sources\.map\(\(\{[^}]*snippet/);
  const generationContext = protocolService.slice(protocolService.indexOf("const generationContext ="), protocolService.indexOf("try {", protocolService.indexOf("const generationContext =")));
  assert.doesNotMatch(generationContext, /productId|researchRunId|sources|sourceType|snippet/);
  assert.match(generationContext, /projectMode === "comparison" \? \{ comparability: result\.comparability \} : \{\}/);
  assert.match(router, /Return exactly one valid JSON object/);
  assert.match(router, /Do not use Markdown or code fences/);
  assert.match(router, /Do not stop before closing the root JSON object/);
  assert.match(config, /protocol:[\s\S]*promptVersion: "protocol\.v13-quick-compliance-baseline"[\s\S]*reasoning: "standard"[\s\S]*repairReasoning: "standard"/);
  assert.match(protocolService, /\[ProtocolPerformance\]/);
  assert.match(protocolService, /attempts: generated\.attemptPerformance/);
});

test("E2E provider plans cover success, empty, truncated, invalid JSON, and schema repair", () => {
  for (const scenario of ["normal", "empty-then-success", "always-empty", "truncated-then-success", "invalid-json-then-success", "schema-invalid-then-success"]) {
    assert.match(providerMock, new RegExp(scenario));
  }
  assert.match(providerMock, /empty_response[\s\S]*finishReason/);
  assert.match(providerMock, /truncated_response[\s\S]*"length"/);
  assert.match(providerMock, /Previous response was empty/);
  assert.match(providerMock, /Previous response was truncated/);
});
