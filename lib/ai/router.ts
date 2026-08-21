import "server-only";

import { z } from "zod";
import { AIConfigurationError, AIProviderError, AIValidationError } from "@/lib/ai/errors";
import { resolveAITaskRoute } from "@/lib/ai/config";
import { DeepSeekProvider } from "@/lib/ai/providers/deepseek.provider";
import type { AIProvider } from "@/lib/ai/providers/provider";
import { ZhipuProvider } from "@/lib/ai/providers/zhipu.provider";
import { getAIProviderKey } from "@/lib/env/server";
import type {
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
      content: `Return only valid JSON for schema ${request.schemaName}: ${JSON.stringify(responseSchema)}`,
    },
    ...request.messages,
  ];
  await request.beforeExecute?.(route);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await provider.generateStructured({ task: route.task, model: route.model, messages, maxTokens: request.maxTokens, reasoning: route.reasoning, attempt, timeoutMs: route.timeoutMs });
      const json = parseJson(response.content, route.task, request.schemaName);
      const validated = request.schema.safeParse(json);
      if (!validated.success) {
        const issuePaths = validated.error.issues.slice(0, 6).map((issue) => `${issue.path.join(".") || "root"}:${issue.code}`).join(",");
        throw new AIValidationError(route.task, `${request.schemaName}[${issuePaths}]`);
      }
      return { data: validated.data, route, requestId: response.requestId, usage: response.usage, attempts: attempt };
    } catch (error) {
      lastError = error;
      if (error instanceof AIValidationError) {
        logAIValidationError(route, error, attempt);
        break;
      }
      if (!(error instanceof AIProviderError)) break;
      const willRetry = error.retryable && attempt < maxAttempts;
      const retryDelayMs = willRetry ? getRetryDelayMs(attempt) : null;
      logAIProviderError(error, maxAttempts, retryDelayMs);
      if (!willRetry || retryDelayMs === null) break;
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

function logAIProviderError(error: AIProviderError, maxAttempts: number, retryDelayMs: number | null) {
  console.error("[AIProviderError]", {
    provider: error.provider,
    model: error.model,
    task: error.task,
    status: error.status,
    timeout: error.category === "timeout",
    timeoutMs: error.timeoutMs,
    attempt: error.attempt,
    maxAttempts,
    latencyMs: error.latencyMs,
    errorCategory: error.category,
    retryable: error.retryable,
    willRetry: retryDelayMs !== null,
    retryDelayMs,
  });
}

function logAIValidationError(route: ReturnType<typeof resolveAITaskRoute>, error: AIValidationError, attempt: number) {
  console.error("[AIValidationError]", { provider: route.provider, model: route.model, task: route.task, attempt, schemaName: error.schemaName, errorCategory: "schema_validation" });
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
    throw new AIValidationError(task, schemaName);
  }
}
