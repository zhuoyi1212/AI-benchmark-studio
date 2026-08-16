import "server-only";

import { normalizeCompletionResponse } from "@/lib/ai/providers/completion-response";
import { postProviderJson } from "@/lib/ai/providers/http";
import type { AIProvider } from "@/lib/ai/providers/provider";
import type { ProviderCompletionRequest } from "@/lib/ai/types";

const deepSeekChatEndpoint = "https://api.deepseek.com/chat/completions";

export class DeepSeekProvider implements AIProvider {
  readonly name = "deepseek" as const;

  constructor(private readonly apiKey: string) {}

  async generateStructured(request: ProviderCompletionRequest) {
    const { data, latencyMs } = await postProviderJson(this.name, deepSeekChatEndpoint, this.apiKey, {
      model: request.model,
      messages: request.messages,
      response_format: { type: "json_object" },
      max_tokens: request.maxTokens ?? 16_384,
      thinking: { type: "enabled" },
      reasoning_effort: "high",
      stream: false,
    });

    // reasoning_content is intentionally ignored; only the final structured answer enters the domain.
    return normalizeCompletionResponse(this.name, data, latencyMs);
  }
}
