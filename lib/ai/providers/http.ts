import "server-only";

import { AIProviderError, classifyProviderStatus } from "@/lib/ai/errors";
import type { AIProviderRequestContext } from "@/lib/ai/types";
import { CompletionStreamError, readCompletionStream } from "@/lib/ai/providers/completion-stream";

type ProviderHttpOptions = AIProviderRequestContext & {
  model: string;
  authorization?: "bearer" | "raw";
};

export async function postProviderJson(
  provider: string,
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
  options: ProviderHttpOptions,
): Promise<{ data: unknown; latencyMs: number; status: number }> {
  const startedAt = performance.now();
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: options.authorization === "raw" ? apiKey : `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs),
      cache: "no-store",
    });
  } catch (error) {
    const latencyMs = Math.round(performance.now() - startedAt);
    const category = isTimeoutError(error) ? "timeout" : "network";
    throw new AIProviderError(`${provider} request failed before receiving a response`, {
      provider,
      model: options.model,
      task: options.task,
      attempt: options.attempt,
      latencyMs,
      timeoutMs: options.timeoutMs,
      category,
    });
  }

  const headersLatencyMs = Math.round(performance.now() - startedAt);
  if (!response.ok) {
    const details = await readSafeProviderError(response);
    throw new AIProviderError(`${provider} request failed with status ${response.status}`, {
      provider,
      model: options.model,
      task: options.task,
      status: response.status,
      attempt: options.attempt,
      latencyMs: headersLatencyMs,
      timeoutMs: options.timeoutMs,
      category: provider === "zhipu" && details.providerCode === "1113" ? "payment_required" : classifyProviderStatus(response.status),
      ...details,
    });
  }

  const responseContentType = response.headers.get("content-type");
  if (responseContentType?.includes("text/event-stream")) {
    try {
      const data = await readCompletionStream(response);
      return { data, latencyMs: Math.round(performance.now() - startedAt), status: response.status };
    } catch (error) {
      throw new AIProviderError(`${provider} completion stream could not be read`, {
        provider, model: options.model, task: options.task, status: response.status,
        attempt: options.attempt, latencyMs: Math.round(performance.now() - startedAt), timeoutMs: options.timeoutMs,
        category: error instanceof CompletionStreamError ? error.category : isTimeoutError(error) ? "timeout" : "network",
        responseContentType,
      });
    }
  }
  let responseBody: string;
  try {
    responseBody = await response.text();
  } catch (error) {
    throw new AIProviderError(`${provider} response body could not be read`, {
      provider,
      model: options.model,
      task: options.task,
      status: response.status,
      attempt: options.attempt,
      latencyMs: Math.round(performance.now() - startedAt),
      timeoutMs: options.timeoutMs,
      category: isTimeoutError(error) ? "timeout" : "network",
      responseContentType,
    });
  }
  const latencyMs = Math.round(performance.now() - startedAt);
  try {
    return { data: JSON.parse(responseBody), latencyMs, status: response.status };
  } catch {
    throw new AIProviderError(`${provider} returned a non-JSON HTTP response body`, {
      provider,
      model: options.model,
      task: options.task,
      status: response.status,
      attempt: options.attempt,
      latencyMs,
      timeoutMs: options.timeoutMs,
      category: "invalid_json_body",
      responseContentType,
      responseBodyLength: responseBody.length,
    });
  }
}

async function readSafeProviderError(response: Response): Promise<{ providerCode: string | null; inputIssue: "mixed_media" | null }> {
  // Never retain the raw response: it may echo evidence, URLs or credentials.
  try {
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || !("error" in payload)) return { providerCode: null, inputIssue: null };
    const error = payload.error;
    if (!error || typeof error !== "object") return { providerCode: null, inputIssue: null };
    const code = "code" in error ? String(error.code) : "";
    const message = "message" in error && typeof error.message === "string" ? error.message : "";
    return {
      providerCode: /^\d{3,6}$/.test(code) ? code : null,
      inputIssue: /simultaneous understanding of documents, videos, and images is not supported/i.test(message) ? "mixed_media" : null,
    };
  } catch {
    return { providerCode: null, inputIssue: null };
  }
}

function isTimeoutError(error: unknown) {
  if (!(error instanceof Error)) return false;
  if (error.name === "TimeoutError" || error.name === "AbortError") return true;
  const cause = error.cause;
  if (!cause || typeof cause !== "object") return false;
  const code = "code" in cause ? cause.code : null;
  return code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT" || code === "UND_ERR_HEADERS_TIMEOUT";
}
