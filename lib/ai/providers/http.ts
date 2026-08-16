import "server-only";

import { AIProviderError } from "@/lib/ai/errors";

const requestTimeoutMs = 90_000;

export async function postProviderJson(
  provider: string,
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
  authorization: "bearer" | "raw" = "bearer",
): Promise<{ data: unknown; latencyMs: number }> {
  const startedAt = performance.now();
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authorization === "bearer" ? `Bearer ${apiKey}` : apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(requestTimeoutMs),
      cache: "no-store",
    });
  } catch {
    throw new AIProviderError(provider, `${provider} request failed before receiving a response`);
  }

  const latencyMs = Math.round(performance.now() - startedAt);
  if (!response.ok) {
    throw new AIProviderError(provider, `${provider} request failed with status ${response.status}`, response.status);
  }

  try {
    return { data: await response.json(), latencyMs };
  } catch {
    throw new AIProviderError(provider, `${provider} returned an invalid JSON envelope`, response.status);
  }
}
