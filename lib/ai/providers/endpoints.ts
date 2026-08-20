import "server-only";

import { AIConfigurationError } from "@/lib/ai/errors";
import type { AIProviderName } from "@/lib/ai/types";

const e2eCredential = "e2e-local-provider-boundary";

export function resolveProviderRequest(
  provider: AIProviderName,
  path: string,
  productionEndpoint: string,
  productionApiKey: string,
): { endpoint: string; apiKey: string } {
  const testBaseUrl = process.env.AI_E2E_PROVIDER_BASE_URL?.trim();
  if (!testBaseUrl) return { endpoint: productionEndpoint, apiKey: productionApiKey };

  if (process.env.NODE_ENV === "production" || process.env.E2E_TEST_MODE !== "1") {
    throw new AIConfigurationError("AI_E2E_PROVIDER_BASE_URL is restricted to the explicit non-production E2E harness");
  }

  let parsedBaseUrl: URL;
  try {
    parsedBaseUrl = new URL(testBaseUrl);
  } catch {
    throw new AIConfigurationError("AI_E2E_PROVIDER_BASE_URL must be a valid URL");
  }
  if (!["127.0.0.1", "localhost", "::1"].includes(parsedBaseUrl.hostname)) {
    throw new AIConfigurationError("AI_E2E_PROVIDER_BASE_URL must resolve to localhost");
  }

  return {
    endpoint: new URL(`/${provider}${path}`, parsedBaseUrl).toString(),
    apiKey: e2eCredential,
  };
}
