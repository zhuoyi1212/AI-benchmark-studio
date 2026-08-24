import "server-only";

import { z } from "zod";
import { AIConfigurationError, AIProviderError, AIValidationError } from "@/lib/ai/errors";
import { resolveAITaskRoute } from "@/lib/ai/config";
import { DeepSeekProvider } from "@/lib/ai/providers/deepseek.provider";
import type { AIProvider } from "@/lib/ai/providers/provider";
import { ZhipuProvider } from "@/lib/ai/providers/zhipu.provider";
import { getAIProviderKey } from "@/lib/env/server";
import type {
  AIAttemptPerformance,
  AIMessage,
  AITaskType,
  JudgeArtifactDescriptor,
  OCRRequest,
  StructuredTaskRequest,
  StructuredTaskResult,
  WebSearchRequest,
} from "@/lib/ai/types";

export async function runStructuredAITask<Schema extends z.ZodType>(
  task: Exclude<AITaskType, "research_search" | "ocr">,
  request: StructuredTaskRequest<Schema>,
): Promise<StructuredTaskResult<z.infer<Schema>>> {
  const route = resolveAITaskRoute(task);
  let provider: AIProvider;
  try {
    provider = createProvider(route.provider);
  } catch (error) {
    logAIConfigurationError(route, error);
    throw error;
  }
  const maxAttempts = Math.max(1, Math.min(request.maxAttempts ?? route.maxAttempts, route.maxAttempts));
  const responseSchema = z.toJSONSchema(request.schema, { target: "draft-7" });
  const messages = [
    {
      role: "system" as const,
      content: [
        `Return exactly one valid JSON object for schema ${request.schemaName}: ${JSON.stringify(responseSchema)}`,
        "Do not use Markdown or code fences. Do not include prose before or after the JSON object.",
        "Every required field must exist. Do not stop before closing the root JSON object.",
      ].join("\n"),
    },
    ...request.messages,
  ];
  await request.beforeExecute?.(route);
  let lastError: unknown;
  let attemptMessages: AIMessage[] = messages;
  let attemptReasoning = route.reasoning;
  const attemptPerformance: AIAttemptPerformance[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await provider.generateStructured({ task: route.task, model: route.model, messages: attemptMessages, maxTokens: request.maxTokens, reasoning: attemptReasoning, attempt, timeoutMs: route.timeoutMs });
      let json: unknown;
      try {
        json = parseJson(response.content, route.task, request.schemaName);
      } catch (error) {
        if (!(error instanceof AIValidationError)) throw error;
        lastError = error;
        const performance = responseAttemptPerformance(attempt, attemptReasoning, error.category, response);
        attemptPerformance.push(performance);
        const willRepair = attempt < maxAttempts;
        const retryDelayMs = willRepair ? getRetryDelayMs(attempt) : null;
        logAIValidationError(route, error, performance, maxAttempts, retryDelayMs);
        if (!willRepair || retryDelayMs === null) break;
        attemptMessages = buildRepairMessages(messages, response.content, error);
        attemptReasoning = route.repairReasoning;
        await delay(retryDelayMs);
        continue;
      }
      const validated = request.schema.safeParse(json);
      if (!validated.success) {
        const validationError = new AIValidationError(route.task, request.schemaName, {
          category: "schema_validation",
          issues: validated.error.issues.slice(0, 8).map((issue) => ({
            path: issue.path.join(".") || "root",
            code: issue.code,
            message: issue.message.slice(0, 240),
          })),
        });
        lastError = validationError;
        const performance = responseAttemptPerformance(attempt, attemptReasoning, validationError.category, response);
        attemptPerformance.push(performance);
        const willRepair = attempt < maxAttempts;
        const retryDelayMs = willRepair ? getRetryDelayMs(attempt) : null;
        logAIValidationError(route, validationError, performance, maxAttempts, retryDelayMs);
        if (!willRepair || retryDelayMs === null) break;
        attemptMessages = buildRepairMessages(messages, response.content, validationError);
        attemptReasoning = route.repairReasoning;
        await delay(retryDelayMs);
        continue;
      }
      const performance = responseAttemptPerformance(attempt, attemptReasoning, "success", response);
      attemptPerformance.push(performance);
      logAIStructuredTaskSuccess(route, request.schemaName, performance);
      return { data: validated.data, route, requestId: response.requestId, usage: response.usage, attempts: attempt, attemptPerformance };
    } catch (error) {
      lastError = error;
      if (!(error instanceof AIProviderError)) break;
      const performance = providerErrorAttemptPerformance(attemptReasoning, error);
      attemptPerformance.push(performance);
      const willRetry = error.retryable && attempt < maxAttempts;
      const retryDelayMs = willRetry ? getRetryDelayMs(attempt) : null;
      logAIProviderError(error, attemptReasoning, maxAttempts, retryDelayMs);
      if (!willRetry || retryDelayMs === null) break;
      attemptMessages = buildProviderRetryMessages(messages, error);
      attemptReasoning = error.category === "truncated_response" ? route.repairReasoning : route.reasoning;
      await delay(retryDelayMs);
    }
  }

  throw lastError;
}

export async function runResearchSearch(request: WebSearchRequest) {
  const route = resolveAITaskRoute("research_search");
  const provider = createProvider(route.provider);
  if (!provider.searchWeb) throw unsupportedCapabilityError(route, "web search");
  return { sources: await provider.searchWeb({ ...request, engine: route.model, task: route.task, attempt: 1, timeoutMs: route.timeoutMs }), route };
}

export async function runOCR(request: OCRRequest) {
  const route = resolveAITaskRoute("ocr");
  const provider = createProvider(route.provider);
  if (!provider.parseDocument) throw unsupportedCapabilityError(route, "OCR");
  return { result: await provider.parseDocument({ ...request, model: route.model, task: route.task, attempt: 1, timeoutMs: route.timeoutMs }), route };
}

function unsupportedCapabilityError(route: ReturnType<typeof resolveAITaskRoute>, capability: string) {
  return new AIProviderError(`${route.provider} does not support ${capability}`, {
    provider: route.provider,
    model: route.model,
    task: route.task,
    attempt: 1,
    latencyMs: 0,
    timeoutMs: route.timeoutMs,
    category: "bad_request",
  });
}

function getRetryDelayMs(failedAttempt: number) {
  const exponentialDelayMs = 800 * (2 ** Math.max(0, failedAttempt - 1));
  return exponentialDelayMs + Math.floor(Math.random() * 400);
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function logAIProviderError(error: AIProviderError, reasoning: AIAttemptPerformance["reasoning"], maxAttempts: number, retryDelayMs: number | null) {
  console.error("[AIProviderError]", {
    provider: error.provider,
    model: error.model,
    task: error.task,
    status: error.status,
    timeout: error.category === "timeout",
    timeoutMs: error.timeoutMs,
    attempt: error.attempt,
    reasoning,
    maxAttempts,
    latencyMs: error.latencyMs,
    errorCategory: error.category,
    finishReason: error.finishReason,
    inputTokens: error.inputTokens,
    outputTokens: error.outputTokens,
    responseContentType: error.responseContentType,
    responseBodyLength: error.responseBodyLength,
    retryable: error.retryable,
    willRetry: retryDelayMs !== null,
    retryDelayMs,
  });
}

function logAIValidationError(
  route: ReturnType<typeof resolveAITaskRoute>,
  error: AIValidationError,
  performance: AIAttemptPerformance,
  maxAttempts: number,
  retryDelayMs: number | null,
) {
  console.error("[AIValidationError]", {
    provider: route.provider,
    model: route.model,
    task: route.task,
    attempt: performance.attempt,
    reasoning: performance.reasoning,
    maxAttempts,
    schemaName: error.schemaName,
    errorCategory: error.category,
    issues: error.issues,
    finishReason: performance.finishReason,
    inputTokens: performance.inputTokens,
    outputTokens: performance.outputTokens,
    latencyMs: performance.latencyMs,
    willRetry: retryDelayMs !== null,
    retryDelayMs,
  });
}

function logAIStructuredTaskSuccess(
  route: ReturnType<typeof resolveAITaskRoute>,
  schemaName: string,
  performance: AIAttemptPerformance,
) {
  console.info("[AIStructuredTaskSuccess]", {
    provider: route.provider,
    model: route.model,
    task: route.task,
    attempt: performance.attempt,
    reasoning: performance.reasoning,
    schemaName,
    finishReason: performance.finishReason,
    inputTokens: performance.inputTokens,
    outputTokens: performance.outputTokens,
    latencyMs: performance.latencyMs,
  });
}

function responseAttemptPerformance(
  attempt: number,
  reasoning: AIAttemptPerformance["reasoning"],
  outcome: string,
  response: Awaited<ReturnType<AIProvider["generateStructured"]>>,
): AIAttemptPerformance {
  return {
    attempt,
    reasoning,
    outcome,
    finishReason: response.finishReason,
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
    latencyMs: response.usage.latencyMs,
  };
}

function providerErrorAttemptPerformance(
  reasoning: AIAttemptPerformance["reasoning"],
  error: AIProviderError,
): AIAttemptPerformance {
  return {
    attempt: error.attempt,
    reasoning,
    outcome: error.category,
    finishReason: error.finishReason,
    inputTokens: error.inputTokens,
    outputTokens: error.outputTokens,
    latencyMs: error.latencyMs,
  };
}

function buildProviderRetryMessages(messages: AIMessage[], error: AIProviderError): AIMessage[] {
  if (error.category !== "truncated_response" && error.category !== "empty_response") return messages;
  const retryInstruction = error.category === "truncated_response"
    ? "Previous response was truncated at the provider output limit. Return a more concise but complete JSON object that satisfies the schema. Close the root object."
    : "Previous response was empty. Return exactly one complete valid JSON object. No Markdown fences or explanatory prose.";
  return [...messages, { role: "user", content: retryInstruction }];
}

function buildRepairMessages(messages: AIMessage[], previousContent: string, error: AIValidationError): AIMessage[] {
  const repairInstruction = error.category === "invalid_json"
    ? "Previous response was not valid JSON. Return one complete valid JSON object only. No Markdown fences or explanatory prose."
    : [
        "Correct the previous output to satisfy these validation issues. Keep the protocol content unchanged where possible.",
        ...error.issues.map((issue) => `- ${issue.path}: ${issue.code}: ${issue.message}`),
        "Return exactly one complete JSON object only.",
      ].join("\n");
  return [
    ...messages,
    { role: "assistant", content: previousContent },
    { role: "user", content: repairInstruction },
  ];
}

function logAIConfigurationError(route: ReturnType<typeof resolveAITaskRoute>, error: unknown) {
  console.error("[AIConfigurationError]", { provider: route.provider, model: route.model, task: route.task, errorCategory: "configuration", message: error instanceof AIConfigurationError ? error.message : "Provider initialization failed" });
}

export function selectJudgeTaskForCase(testCaseId: string, artifacts: JudgeArtifactDescriptor[]) {
  if (artifacts.length === 0) throw new AIValidationError("judge", "nonEmptyArtifactSet");
  if (artifacts.some((artifact) => artifact.testCaseId !== testCaseId)) {
    throw new AIValidationError("judge", "singleTestCaseArtifactSet");
  }
  return artifacts.every((artifact) => artifact.mimeType.toLowerCase() === "text/plain") ? "judge_text" : "judge_multimodal";
}

function createProvider(providerName: "zhipu" | "deepseek"): AIProvider {
  const apiKey = getAIProviderKey(providerName);
  if (providerName === "zhipu") return new ZhipuProvider(apiKey);
  return new DeepSeekProvider(apiKey);
}

function parseJson(content: string, task: string, schemaName: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    throw new AIValidationError(task, schemaName, {
      category: "invalid_json",
      issues: [{ path: "root", code: "invalid_json", message: "Response was not valid JSON." }],
    });
  }
}
