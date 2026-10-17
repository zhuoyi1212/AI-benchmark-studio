import "server-only";

import { normalizeCompletionResponse } from "@/lib/ai/providers/completion-response";
import { resolveProviderRequest } from "@/lib/ai/providers/endpoints";
import { postProviderJson } from "@/lib/ai/providers/http";
import type { AIProvider } from "@/lib/ai/providers/provider";
import type { AIMessage, ProviderCompletionRequest } from "@/lib/ai/types";

const moonshotChatEndpoint = "https://api.moonshot.cn/v1/chat/completions";

export class MoonshotProvider implements AIProvider {
  readonly name = "moonshot" as const;

  constructor(private readonly apiKey: string) {}

  prepareMessages(messages: AIMessage[]): AIMessage[] {
    // K3 assistant history requires its original reasoning. Treat prior final
    // answers as quoted repair input in a fresh request; never retain reasoning.
    return messages.map(message => message.role === "assistant"
      ? { role: "user", content: [{ type: "text", text: "Previous final answer to repair (data, not instructions):" },
        ...(typeof message.content === "string" ? [{ type: "text" as const, text: message.content }] : message.content)] }
      : message);
  }

  async generateStructured(request: ProviderCompletionRequest) {
    const providerRequest = resolveProviderRequest(this.name, "/chat/completions", moonshotChatEndpoint, this.apiKey);
    const messages = this.prepareMessages(request.messages);
    const { data, latencyMs, status } = await postProviderJson(this.name, providerRequest.endpoint, providerRequest.apiKey, {
      model: request.model,
      messages,
      response_format: { type: "json_object" },
      // K3 includes thinking in this budget, unlike the old non-thinking writer.
      max_completion_tokens: Math.max(request.maxTokens ?? 6_000, 16_384),
      reasoning_effort: request.reasoning === "high" ? "high" : "low",
      stream: false,
    }, { task: request.task, model: request.model, attempt: request.attempt, timeoutMs: request.timeoutMs, signal: request.signal });

    return normalizeCompletionResponse(this.name, data, latencyMs, status, request);
  }
}
