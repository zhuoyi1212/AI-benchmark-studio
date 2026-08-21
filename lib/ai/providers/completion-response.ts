import "server-only";

import { z } from "zod";
import { AIProviderError } from "@/lib/ai/errors";
import type { AIProviderRequestContext, AIUsage, ProviderCompletionResponse } from "@/lib/ai/types";

const completionEnvelopeSchema = z.object({
  id: z.string().optional(),
  request_id: z.string().optional(),
  choices: z.array(z.object({
    message: z.object({
      content: z.string().nullable(),
      reasoning_content: z.unknown().optional(),
    }),
  })).min(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative().optional(),
    completion_tokens: z.number().int().nonnegative().optional(),
  }).optional(),
});

export function normalizeCompletionResponse(
  provider: string,
  value: unknown,
  latencyMs: number,
  status: number,
  context: AIProviderRequestContext & { model: string },
): ProviderCompletionResponse {
  const parsed = completionEnvelopeSchema.safeParse(value);
  if (!parsed.success) throwInvalidResponse(provider, `${provider} returned an unexpected response envelope`, latencyMs, status, context);

  const content = parsed.data.choices[0]?.message.content;
  if (!content) throwInvalidResponse(provider, `${provider} returned an empty final response`, latencyMs, status, context);

  const usage: AIUsage = {
    inputTokens: parsed.data.usage?.prompt_tokens ?? null,
    outputTokens: parsed.data.usage?.completion_tokens ?? null,
    latencyMs,
    estimatedCost: null,
  };

  return {
    content,
    requestId: parsed.data.request_id ?? parsed.data.id ?? null,
    usage,
  };
}

function throwInvalidResponse(
  provider: string,
  message: string,
  latencyMs: number,
  status: number,
  context: AIProviderRequestContext & { model: string },
): never {
  throw new AIProviderError(message, {
    provider,
    model: context.model,
    task: context.task,
    status,
    attempt: context.attempt,
    latencyMs,
    timeoutMs: context.timeoutMs,
    category: "invalid_response",
  });
}
