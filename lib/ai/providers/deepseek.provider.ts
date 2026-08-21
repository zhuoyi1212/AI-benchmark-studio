import "server-only";

import { normalizeCompletionResponse } from "@/lib/ai/providers/completion-response";
import { resolveProviderRequest } from "@/lib/ai/providers/endpoints";
import { postProviderJson } from "@/lib/ai/providers/http";
import type { AIProvider } from "@/lib/ai/providers/provider";
import type { ProviderCompletionRequest } from "@/lib/ai/types";

const deepSeekChatEndpoint = "https://api.deepseek.com/chat/completions";

export class DeepSeekProvider implements AIProvider {
  readonly name = "deepseek" as const;

  constructor(private readonly apiKey: string) {}

  async generateStructured(request: ProviderCompletionRequest) {
    const highReasoning = request.reasoning === "high";
    const providerRequest = resolveProviderRequest(this.name, "/chat/completions", deepSeekChatEndpoint, this.apiKey);
    const { data, latencyMs, status } = await postProviderJson(this.name, providerRequest.endpoint, providerRequest.apiKey, {
      model: request.model,
      messages: request.messages,
      response_format: { type: "json_object" },
      max_tokens: request.maxTokens ?? 16_384,
      thinking: { type: highReasoning ? "enabled" : "disabled" },
      ...(highReasoning ? { reasoning_effort: "high" } : {}),
      stream: false,
    }, { task: request.task, model: request.model, attempt: request.attempt, timeoutMs: request.timeoutMs });

    // reasoning_content is intentionally ignored; only the final structured answer enters the domain.
    return normalizeCompletionResponse(this.name, data, latencyMs, status, request);
  }
}
