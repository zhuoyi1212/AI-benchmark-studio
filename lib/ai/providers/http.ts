import "server-only";

import { AIProviderError, classifyProviderStatus } from "@/lib/ai/errors";
import type { AIProviderRequestContext } from "@/lib/ai/types";

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
  const requestCounts = countProviderContent(body);
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
      providerMessage: extractNetworkErrorMessage(error, apiKey),
      ...requestCounts,
    });
  }

  const headersLatencyMs = Math.round(performance.now() - startedAt);
  if (!response.ok) {
    const responseContentType = response.headers.get("content-type");
    let responseBody = "";
    try { responseBody = await response.text(); } catch { /* keep the original HTTP failure */ }
    const providerError = extractProviderError(responseBody, apiKey);
    throw new AIProviderError(`${provider} request failed with status ${response.status}`, {
      provider,
      model: options.model,
      task: options.task,
      status: response.status,
      attempt: options.attempt,
      latencyMs: headersLatencyMs,
      timeoutMs: options.timeoutMs,
      category: classifyProviderStatus(response.status),
      responseContentType,
      responseBodyLength: responseBody.length,
      providerCode: providerError.code,
      providerMessage: providerError.message,
      ...requestCounts,
    });
  }

  const responseContentType = response.headers.get("content-type");
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
      providerMessage: extractNetworkErrorMessage(error, apiKey),
      ...requestCounts,
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
      ...requestCounts,
    });
  }
}

function extractProviderError(responseBody: string, apiKey: string): { code: string | null; message: string | null } {
  let value: unknown;
  try { value = JSON.parse(responseBody); } catch { return { code: null, message: null }; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { code: null, message: null };

  const root = value as Record<string, unknown>;
  const nested = root.error && typeof root.error === "object" && !Array.isArray(root.error)
    ? root.error as Record<string, unknown>
    : null;
  const code = firstString(root.code, root.error_code, nested?.code);
  const message = firstString(
    nested?.message,
    nested?.msg,
    root.message,
    root.msg,
    root.error_description,
    root.detail,
    typeof root.error === "string" ? root.error : null,
  );
  return {
    code,
    message: message ? sanitizeProviderMessage(message, apiKey) : null,
  };
}

function extractNetworkErrorMessage(error: unknown, apiKey: string) {
  if (!(error instanceof Error)) return null;
  const cause = error.cause && typeof error.cause === "object" ? error.cause as Record<string, unknown> : null;
  const code = firstString(cause?.code);
  const message = firstString(cause?.message, error.message);
  const summary = [code, message].filter((part): part is string => part !== null).join(": ");
  return summary ? sanitizeProviderMessage(summary, apiKey) : null;
}

function sanitizeProviderMessage(message: string, apiKey: string) {
  const withoutApiKey = apiKey ? message.split(apiKey).join("[redacted]") : message;
  return withoutApiKey
    .replace(/\bBearer\s+[^\s,;"']+/gi, "Bearer [redacted]")
    .replace(/\b(api[_ -]?key|authorization)\s*[:=]\s*[^\s,;"']+/gi, "$1=[redacted]")
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[URL redacted]")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .slice(0, 400);
}

function countProviderContent(body: Record<string, unknown>) {
  let requestTextCount = 0;
  let requestImageCount = 0;
  let requestFileCount = 0;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  for (const message of messages) {
    if (!message || typeof message !== "object" || !("content" in message)) continue;
    const content = message.content;
    if (typeof content === "string") {
      requestTextCount += 1;
      continue;
    }
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object" || !("type" in part)) continue;
      if (part.type === "text") requestTextCount += 1;
      if (part.type === "image_url") requestImageCount += 1;
      if (part.type === "file_url") requestFileCount += 1;
    }
  }
  return { requestTextCount, requestImageCount, requestFileCount };
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
  }
  return null;
}

function isTimeoutError(error: unknown) {
  if (!(error instanceof Error)) return false;
  if (error.name === "TimeoutError" || error.name === "AbortError") return true;
  const cause = error.cause;
  if (!cause || typeof cause !== "object") return false;
  const code = "code" in cause ? cause.code : null;
  return code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT" || code === "UND_ERR_HEADERS_TIMEOUT";
}
