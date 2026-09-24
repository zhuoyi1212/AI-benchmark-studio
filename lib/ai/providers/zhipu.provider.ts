import "server-only";

import { z } from "zod";
import { AIProviderError } from "@/lib/ai/errors";
import { normalizeCompletionResponse } from "@/lib/ai/providers/completion-response";
import { resolveProviderRequest } from "@/lib/ai/providers/endpoints";
import { postProviderJson } from "@/lib/ai/providers/http";
import type { AIProvider } from "@/lib/ai/providers/provider";
import type { ProviderCompletionRequest, ProviderOCRRequest, ProviderWebSearchRequest } from "@/lib/ai/types";

const zhipuBaseUrl = "https://api.z.ai/api/paas/v4";

const searchEnvelopeSchema = z.object({
  search_result: z.array(z.object({
    title: z.string(),
    link: z.string().url(),
    content: z.string().default(""),
    media: z.string().nullable().optional(),
    publish_date: z.string().nullable().optional(),
  })),
});

const ocrEnvelopeSchema = z.object({
  request_id: z.string().optional(),
  id: z.string().optional(),
  md_results: z.string(),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative().optional(),
    completion_tokens: z.number().int().nonnegative().optional(),
  }).optional(),
});

export class ZhipuProvider implements AIProvider {
  readonly name = "zhipu" as const;

  constructor(private readonly apiKey: string) {}

  async generateStructured(request: ProviderCompletionRequest) {
    const providerRequest = resolveProviderRequest(this.name, "/chat/completions", `${zhipuBaseUrl}/chat/completions`, this.apiKey);
    const { data, latencyMs, status } = await postProviderJson(this.name, providerRequest.endpoint, providerRequest.apiKey, {
      model: request.model,
      messages: request.messages,
      response_format: { type: "json_object" },
      max_tokens: request.maxTokens ?? 16_384,
      thinking: { type: request.reasoning === "high" ? "enabled" : "disabled" },
      stream: true,
    }, { task: request.task, model: request.model, attempt: request.attempt, timeoutMs: request.timeoutMs });

    // Provider thinking fields are intentionally discarded by normalization.
    return normalizeCompletionResponse(this.name, data, latencyMs, status, request);
  }

  async searchWeb(request: ProviderWebSearchRequest) {
    const providerRequest = resolveProviderRequest(this.name, "/web_search", `${zhipuBaseUrl}/web_search`, this.apiKey);
    const { data, latencyMs, status } = await postProviderJson(this.name, providerRequest.endpoint, providerRequest.apiKey, {
      search_query: request.query,
      search_engine: request.engine,
      count: request.count ?? 10,
      search_domain_filter: request.domain,
      search_recency_filter: "noLimit",
    }, { task: request.task, model: request.engine, attempt: request.attempt, timeoutMs: request.timeoutMs });
    const parsed = searchEnvelopeSchema.safeParse(data);
    if (!parsed.success) throw new AIProviderError("zhipu returned an invalid web search response", { provider: this.name, model: request.engine, task: request.task, status, attempt: request.attempt, latencyMs, timeoutMs: request.timeoutMs, category: "invalid_envelope" });
    return parsed.data.search_result.map((source) => ({
      title: source.title,
      url: source.link,
      snippet: source.content,
      siteName: source.media ?? null,
      publishedAt: source.publish_date ?? null,
    }));
  }

  async parseDocument(request: ProviderOCRRequest) {
    const providerRequest = resolveProviderRequest(this.name, "/layout_parsing", `${zhipuBaseUrl}/layout_parsing`, this.apiKey);
    const { data, latencyMs, status } = await postProviderJson(this.name, providerRequest.endpoint, providerRequest.apiKey, {
      model: request.model,
      file: request.fileUrl,
    }, { task: request.task, model: request.model, attempt: request.attempt, timeoutMs: request.timeoutMs, authorization: "raw" });
    const parsed = ocrEnvelopeSchema.safeParse(data);
    if (!parsed.success) throw new AIProviderError("zhipu returned an invalid OCR response", { provider: this.name, model: request.model, task: request.task, status, attempt: request.attempt, latencyMs, timeoutMs: request.timeoutMs, category: "invalid_envelope" });
    return {
      markdown: parsed.data.md_results,
      requestId: parsed.data.request_id ?? parsed.data.id ?? null,
      usage: {
        inputTokens: parsed.data.usage?.prompt_tokens ?? null,
        outputTokens: parsed.data.usage?.completion_tokens ?? null,
        latencyMs,
        estimatedCost: null,
      },
    };
  }
}
