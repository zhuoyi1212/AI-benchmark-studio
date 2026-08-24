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
    finish_reason: z.string().nullable().optional(),
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
  if (!parsed.success) throwCompletionResponseError(provider, `${provider} returned an unexpected response envelope`, "invalid_envelope", latencyMs, status, context);

  const content = parsed.data.choices[0]?.message.content;
  const finishReason = parsed.data.choices[0]?.finish_reason ?? null;
  const inputTokens = parsed.data.usage?.prompt_tokens ?? null;
  const outputTokens = parsed.data.usage?.completion_tokens ?? null;
  if (isTruncatedFinishReason(finishReason)) {
    throwCompletionResponseError(provider, `${provider} truncated the final response at the output limit`, "truncated_response", latencyMs, status, context, {
      finishReason,
      inputTokens,
      outputTokens,
    });
  }
  if (!content?.trim()) {
    throwCompletionResponseError(provider, `${provider} returned an empty final response`, "empty_response", latencyMs, status, context, {
      finishReason,
      inputTokens,
      outputTokens,
    });
  }

  const usage: AIUsage = {
    inputTokens,
    outputTokens,
    latencyMs,
    estimatedCost: null,
  };

  return {
    content,
    finishReason,
    requestId: parsed.data.request_id ?? parsed.data.id ?? null,
    usage,
  };
}

function isTruncatedFinishReason(finishReason: string | null) {
  return finishReason === "length" || finishReason === "max_tokens" || finishReason === "max_output_tokens";
}

function throwCompletionResponseError(
  provider: string,
  message: string,
  category: "invalid_envelope" | "empty_response" | "truncated_response",
  latencyMs: number,
  status: number,
  context: AIProviderRequestContext & { model: string },
  responseDetails: {
    finishReason?: string | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
  } = {},
): never {
  throw new AIProviderError(message, {
    provider,
    model: context.model,
    task: context.task,
    status,
    attempt: context.attempt,
    latencyMs,
    timeoutMs: context.timeoutMs,
    category,
    ...responseDetails,
  });
}
