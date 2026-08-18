import type { ZodType } from "zod";

export const aiTaskTypes = [
  "research_search",
  "research",
  "comparability",
  "protocol",
  "judge_text",
  "judge_multimodal",
  "result_analysis",
  "report",
  "content_discovery",
  "community_post",
  "screenshot_understanding",
  "ocr",
] as const;

export type AITaskType = (typeof aiTaskTypes)[number];
export type AIProviderName = "zhipu" | "deepseek";
export type AICapability = "structured_text" | "multimodal" | "web_search" | "ocr";
export type AIReasoningMode = "standard" | "high";

export type AITextContent = { type: "text"; text: string };
export type AIImageContent = { type: "image_url"; image_url: { url: string } };
export type AIVideoContent = { type: "video_url"; video_url: { url: string } };
export type AIFileContent = { type: "file_url"; file_url: { url: string } };
export type AIMessageContent = string | Array<AITextContent | AIImageContent | AIVideoContent | AIFileContent>;

export type AIMessage = {
  role: "system" | "user" | "assistant";
  content: AIMessageContent;
};

export type AITaskRoute = {
  task: AITaskType;
  provider: AIProviderName;
  model: string;
  capability: AICapability;
  promptVersion: string;
  reasoning: AIReasoningMode;
};

export type AIUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  estimatedCost: number | null;
};

export type ProviderCompletionRequest = {
  model: string;
  messages: AIMessage[];
  maxTokens?: number;
  reasoning: AIReasoningMode;
};

export type ProviderCompletionResponse = {
  content: string;
  requestId: string | null;
  usage: AIUsage;
};

export type WebSearchRequest = { query: string; count?: number; domain?: string };
export type ProviderWebSearchRequest = WebSearchRequest & { engine: string };
export type ResearchSource = { title: string; url: string; snippet: string; siteName: string | null; publishedAt: string | null };
export type OCRRequest = { fileUrl: string };
export type ProviderOCRRequest = OCRRequest & { model: string };
export type OCRResult = { markdown: string; requestId: string | null; usage: AIUsage };

export type StructuredTaskRequest<Schema extends ZodType> = {
  schema: Schema;
  schemaName: string;
  messages: AIMessage[];
  maxTokens?: number;
  maxAttempts?: number;
  beforeExecute?: (route: AITaskRoute) => Promise<void>;
};

export type StructuredTaskResult<Output> = { data: Output; route: AITaskRoute; requestId: string | null; usage: AIUsage; attempts: number };
export type JudgeArtifactDescriptor = { id: string; testCaseId: string; mimeType: string };
