import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [errors, http, router, config, protocolService, protocolRepository, protocolMigration, actions, actionComponent, view, button] = await Promise.all([
  read("lib/ai/errors.ts"),
  read("lib/ai/providers/http.ts"),
  read("lib/ai/router.ts"),
  read("lib/ai/config.ts"),
  read("lib/services/protocols.service.ts"),
  read("lib/repositories/protocols.repository.ts"),
  read("supabase/migrations/202608170007_protocol_lifecycle.sql"),
  read("app/projects/[projectId]/protocol/actions.ts"),
  read("app/projects/[projectId]/protocol/protocol-actions.tsx"),
  read("app/projects/[projectId]/protocol/protocol-view.tsx"),
  read("components/ui/button.tsx"),
]);

test("classifies provider failures without exposing request secrets", () => {
  assert.match(errors, /status === 408[\s\S]*"timeout"/);
  assert.match(errors, /status === 429[\s\S]*"rate_limit"/);
  assert.match(errors, /status >= 500[\s\S]*"provider_5xx"/);
  assert.match(errors, /status === 401 \|\| status === 403[\s\S]*"authentication"/);
  assert.match(errors, /return "bad_request"/);
  assert.match(http, /error\.name === "TimeoutError" \|\| error\.name === "AbortError"/);
  assert.match(http, /UND_ERR_CONNECT_TIMEOUT/);
  assert.match(http, /category: "invalid_response"/);
  const providerLog = router.slice(router.indexOf("function logAIProviderError"), router.indexOf("function logAIValidationError"));
  assert.doesNotMatch(providerLog, /apiKey|messages|prompt|response\.content/);
});

test("uses a bounded task-specific timeout and retry budget", () => {
  assert.match(config, /standardTimeoutMs = 90_000/);
  assert.match(config, /reasoningHeavyTimeoutMs = 120_000/);
  assert.match(config, /structuredTaskMaxAttempts = 2/);
  assert.match(config, /protocol:[\s\S]*timeoutMs: reasoningHeavyTimeoutMs/);
  assert.match(config, /judge_text:[\s\S]*timeoutMs: reasoningHeavyTimeoutMs/);
  assert.match(config, /result_analysis:[\s\S]*timeoutMs: reasoningHeavyTimeoutMs/);
  assert.match(router, /request\.maxAttempts \?\? route\.maxAttempts, route\.maxAttempts/);
  assert.match(router, /timeoutMs: route\.timeoutMs/);
});

test("retries only transient provider failures with exponential backoff and jitter", () => {
  assert.match(errors, /category === "timeout" \|\| category === "rate_limit" \|\| category === "provider_5xx" \|\| category === "network"/);
  assert.match(router, /error\.retryable && attempt < maxAttempts/);
  assert.match(router, /800 \* \(2 \*\* Math\.max\(0, failedAttempt - 1\)\)/);
  assert.match(router, /Math\.random\(\) \* 400/);
  assert.ok(router.indexOf("await delay(retryDelayMs)") > router.indexOf("logAIProviderError"));
  assert.match(router, /error instanceof AIValidationError[\s\S]*break/);
  assert.match(router, /status:[\s\S]*timeout:[\s\S]*attempt:[\s\S]*latencyMs:[\s\S]*errorCategory/);
});

test("returns distinct safe Protocol messages for timeout, 429, 5xx, auth, and schema validation", () => {
  assert.match(protocolService, /耗时超过限制，已重试但仍未成功/);
  assert.match(protocolService, /请求较多，已重试但仍未成功/);
  assert.match(protocolService, /服务暂时异常，已重试但仍未成功/);
  assert.match(protocolService, /服务配置异常，请检查服务端配置/);
  assert.match(protocolService, /AI 已返回结果，但方案结构校验失败/);
  assert.match(protocolService, /内容无法解析/);
  assert.match(protocolService, /\[ProtocolGenerationFailure\]/);
  assert.doesNotMatch(actions, /AIProviderError|AIValidationError|apiKey|prompt/i);
});

test("failed regeneration cannot replace or partially create the existing Protocol", () => {
  const generateIndex = protocolService.indexOf("await aiTaskService.generateProtocol");
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
  assert.match(actionComponent, /LoaderCircle[\s\S]*正在生成 Protocol\.\.\./);
  assert.match(actionComponent, /RefreshCw[\s\S]*重新生成新版本/);
  assert.match(button, /outline: "border bg-white hover:bg-accent"/);
  assert.match(view, /experienceMode \? "体验方案检查通过" : "公平性检查通过"/);
  assert.match(view, /体验任务聚焦核心能力，并保持证据完整、执行一致/);
});
