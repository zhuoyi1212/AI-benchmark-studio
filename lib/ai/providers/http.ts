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
    throw new AIProviderError(`${provider} request failed with status ${response.status}`, {
      provider,
      model: options.model,
      task: options.task,
      status: response.status,
      attempt: options.attempt,
      latencyMs: headersLatencyMs,
      timeoutMs: options.timeoutMs,
      category: classifyProviderStatus(response.status),
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

function isTimeoutError(error: unknown) {
  if (!(error instanceof Error)) return false;
  if (error.name === "TimeoutError" || error.name === "AbortError") return true;
  const cause = error.cause;
  if (!cause || typeof cause !== "object") return false;
  const code = "code" in cause ? cause.code : null;
  return code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT" || code === "UND_ERR_HEADERS_TIMEOUT";
}
