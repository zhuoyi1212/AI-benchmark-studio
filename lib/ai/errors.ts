import type { AITaskType } from "@/lib/ai/types";

export class AIConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIConfigurationError";
  }
}

export type AIProviderErrorCategory =
  | "timeout"
  | "rate_limit"
  | "provider_5xx"
  | "authentication"
  | "bad_request"
  | "invalid_response"
  | "network";

export type AIProviderErrorDetails = {
  provider: string;
  model: string;
  task: AITaskType;
  status?: number | null;
  attempt: number;
  latencyMs: number;
  timeoutMs: number;
  category: AIProviderErrorCategory;
  retryable?: boolean;
};

export class AIProviderError extends Error {
  readonly provider: string;
  readonly model: string;
  readonly task: AITaskType;
  readonly status: number | null;
  readonly attempt: number;
  readonly latencyMs: number;
  readonly timeoutMs: number;
  readonly category: AIProviderErrorCategory;
  readonly retryable: boolean;

  constructor(message: string, details: AIProviderErrorDetails) {
    super(message);
    this.name = "AIProviderError";
    this.provider = details.provider;
    this.model = details.model;
    this.task = details.task;
    this.status = details.status ?? null;
    this.attempt = details.attempt;
    this.latencyMs = details.latencyMs;
    this.timeoutMs = details.timeoutMs;
    this.category = details.category;
    this.retryable = details.retryable ?? isRetryableProviderCategory(details.category);
  }
}

export function classifyProviderStatus(status: number): AIProviderErrorCategory {
  if (status === 408) return "timeout";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "provider_5xx";
  if (status === 401 || status === 403) return "authentication";
  return "bad_request";
}

export function isRetryableProviderCategory(category: AIProviderErrorCategory) {
  return category === "timeout" || category === "rate_limit" || category === "provider_5xx" || category === "network";
}

export class AIValidationError extends Error {
  readonly task: string;
  readonly schemaName: string;

  constructor(task: string, schemaName: string) {
    super(`AI response failed runtime validation for ${task}`);
    this.name = "AIValidationError";
    this.task = task;
    this.schemaName = schemaName;
  }
}
