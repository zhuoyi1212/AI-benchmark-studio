import "server-only";

import { z } from "zod";
import { AIProviderError } from "@/lib/ai/errors";
import type { AIUsage, ProviderCompletionResponse } from "@/lib/ai/types";

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
): ProviderCompletionResponse {
  const parsed = completionEnvelopeSchema.safeParse(value);
  if (!parsed.success) throw new AIProviderError(provider, `${provider} returned an unexpected response envelope`);

  const content = parsed.data.choices[0]?.message.content;
  if (!content) throw new AIProviderError(provider, `${provider} returned an empty final response`);

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
