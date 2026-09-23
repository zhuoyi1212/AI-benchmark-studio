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
  | "payment_required"
  | "bad_request"
  | "invalid_json_body"
  | "invalid_envelope"
  | "empty_response"
  | "truncated_response"
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
  finishReason?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  responseContentType?: string | null;
  responseBodyLength?: number | null;
  providerCode?: string | null;
  providerMessage?: string | null;
  requestTextCount?: number;
  requestImageCount?: number;
  requestFileCount?: number;
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
  readonly finishReason: string | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly responseContentType: string | null;
  readonly responseBodyLength: number | null;
  readonly providerCode: string | null;
  readonly providerMessage: string | null;
  readonly requestTextCount: number;
  readonly requestImageCount: number;
  readonly requestFileCount: number;

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
    this.finishReason = details.finishReason ?? null;
    this.inputTokens = details.inputTokens ?? null;
    this.outputTokens = details.outputTokens ?? null;
    this.responseContentType = details.responseContentType ?? null;
    this.responseBodyLength = details.responseBodyLength ?? null;
    this.providerCode = details.providerCode ?? null;
    this.providerMessage = details.providerMessage ?? null;
    this.requestTextCount = details.requestTextCount ?? 0;
    this.requestImageCount = details.requestImageCount ?? 0;
    this.requestFileCount = details.requestFileCount ?? 0;
  }
}

export function classifyProviderStatus(status: number): AIProviderErrorCategory {
  if (status === 408) return "timeout";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "provider_5xx";
  if (status === 401 || status === 403) return "authentication";
  if (status === 402) return "payment_required";
  return "bad_request";
}

export function isRetryableProviderCategory(category: AIProviderErrorCategory) {
  return category === "timeout"
    || category === "rate_limit"
    || category === "provider_5xx"
    || category === "network"
    || category === "empty_response"
    || category === "truncated_response";
}

export type AIValidationErrorCategory = "invalid_json" | "schema_validation";

export type AIValidationIssue = {
  path: string;
  code: string;
  message: string;
};

export class AIValidationError extends Error {
  readonly task: string;
  readonly schemaName: string;
  readonly category: AIValidationErrorCategory;
  readonly issues: AIValidationIssue[];

  constructor(
    task: string,
    schemaName: string,
    details: { category?: AIValidationErrorCategory; issues?: AIValidationIssue[] } = {},
  ) {
    super(`AI response failed runtime validation for ${task}`);
    this.name = "AIValidationError";
    this.task = task;
    this.schemaName = schemaName;
    this.category = details.category ?? "schema_validation";
    this.issues = details.issues ?? [];
  }
}
