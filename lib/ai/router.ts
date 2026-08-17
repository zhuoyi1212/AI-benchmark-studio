import "server-only";

import { z } from "zod";
import { AIProviderError, AIValidationError } from "@/lib/ai/errors";
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
  const provider = createProvider(route.provider);
  const maxAttempts = Math.max(1, Math.min(request.maxAttempts ?? 2, 3));
  const responseSchema = z.toJSONSchema(request.schema, { target: "draft-7" });
  const messages = [
    {
      role: "system" as const,
      content: `Return only valid JSON for schema ${request.schemaName}: ${JSON.stringify(responseSchema)}`,
    },
    ...request.messages,
  ];
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await provider.generateStructured({ model: route.model, messages, maxTokens: request.maxTokens, reasoning: route.reasoning });
      const json = parseJson(response.content, route.task, request.schemaName);
      const validated = request.schema.safeParse(json);
      if (!validated.success) throw new AIValidationError(route.task, request.schemaName);
      return { data: validated.data, route, requestId: response.requestId, usage: response.usage, attempts: attempt };
    } catch (error) {
      lastError = error;
      if (!(error instanceof AIValidationError || error instanceof AIProviderError) || attempt === maxAttempts) break;
    }
  }

  throw lastError;
}

export async function runResearchSearch(request: WebSearchRequest) {
  const route = resolveAITaskRoute("research_search");
  const provider = createProvider(route.provider);
  if (!provider.searchWeb) throw new AIProviderError(route.provider, `${route.provider} does not support web search`);
  return { sources: await provider.searchWeb({ ...request, engine: route.model }), route };
}

export async function runOCR(request: OCRRequest) {
  const route = resolveAITaskRoute("ocr");
  const provider = createProvider(route.provider);
  if (!provider.parseDocument) throw new AIProviderError(route.provider, `${route.provider} does not support OCR`);
  return { result: await provider.parseDocument({ ...request, model: route.model }), route };
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
