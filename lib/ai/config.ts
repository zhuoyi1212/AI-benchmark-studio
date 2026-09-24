import "server-only";

import { getAIModelEnvironment } from "@/lib/env/server";
import type { AICapability, AIProviderName, AIReasoningMode, AITaskRoute, AITaskType } from "@/lib/ai/types";

type RouteTemplate = {
  provider: AIProviderName;
  capability: AICapability;
  promptVersion: string;
  reasoning: AIReasoningMode;
  repairReasoning?: AIReasoningMode;
  timeoutMs: number;
  maxAttempts: number;
  model: (models: ReturnType<typeof getAIModelEnvironment>) => string;
};

const standardTimeoutMs = 90_000;
const reasoningHeavyTimeoutMs = 120_000;
const judgeTextTimeoutMs = 300_000;
const structuredTaskMaxAttempts = 2;
const judgeTaskMaxAttempts = 3;

const routeTemplates: Record<AITaskType, RouteTemplate> = {
  research_search: {
    provider: "zhipu",
    capability: "web_search",
    promptVersion: "research-search.v3",
    reasoning: "standard",
    timeoutMs: standardTimeoutMs,
    maxAttempts: structuredTaskMaxAttempts,
    model: () => "search-prime",
  },
  research: {
    provider: "zhipu",
    capability: "structured_text",
    promptVersion: "research-synthesis.v6",
    reasoning: "standard",
    timeoutMs: standardTimeoutMs,
    maxAttempts: structuredTaskMaxAttempts,
    model: (models) => models.zhipuTextModel,
  },
  comparability: {
    provider: "deepseek",
    capability: "structured_text",
    promptVersion: "comparability.v2",
    reasoning: "high",
    timeoutMs: standardTimeoutMs,
    maxAttempts: structuredTaskMaxAttempts,
    model: (models) => models.deepSeekReasoningModel,
  },
  protocol: {
    provider: "deepseek",
    capability: "structured_text",
    promptVersion: "protocol.v10",
    reasoning: "standard",
    repairReasoning: "high",
    timeoutMs: reasoningHeavyTimeoutMs,
    maxAttempts: structuredTaskMaxAttempts,
    model: (models) => models.deepSeekReasoningModel,
  },
  judge_text: {
    provider: "deepseek",
    capability: "structured_text",
    promptVersion: "judge.v1",
    reasoning: "high",
    timeoutMs: judgeTextTimeoutMs,
    maxAttempts: judgeTaskMaxAttempts,
    model: (models) => models.deepSeekReasoningModel,
  },
  judge_multimodal: {
    provider: "zhipu",
    capability: "multimodal",
    promptVersion: "judge.v1",
    reasoning: "standard",
    timeoutMs: standardTimeoutMs,
    maxAttempts: judgeTaskMaxAttempts,
    model: (models) => models.zhipuVisionModel,
  },
  result_analysis: {
    provider: "deepseek",
    capability: "structured_text",
    promptVersion: "result-analysis.v2",
    reasoning: "high",
    timeoutMs: reasoningHeavyTimeoutMs,
    maxAttempts: structuredTaskMaxAttempts,
    model: (models) => models.deepSeekReasoningModel,
  },
  findings: {
    provider: "zhipu",
    capability: "multimodal",
    promptVersion: "findings.v2-pdf-pages",
    reasoning: "high",
    timeoutMs: reasoningHeavyTimeoutMs,
    maxAttempts: structuredTaskMaxAttempts,
    model: (models) => models.zhipuVisionModel,
  },
  report: {
    provider: "zhipu",
    capability: "structured_text",
    promptVersion: "report.v2",
    reasoning: "standard",
    timeoutMs: standardTimeoutMs,
    maxAttempts: structuredTaskMaxAttempts,
    model: (models) => models.zhipuTextModel,
  },
  content_discovery: {
    provider: "deepseek",
    capability: "structured_text",
    promptVersion: "content-discovery.v2",
    reasoning: "standard",
    repairReasoning: "high",
    timeoutMs: reasoningHeavyTimeoutMs,
    maxAttempts: structuredTaskMaxAttempts,
    model: (models) => models.deepSeekReasoningModel,
  },
  community_post: {
    provider: "zhipu",
    capability: "structured_text",
    promptVersion: "community-post.v5-evidence-editorial",
    reasoning: "standard",
    timeoutMs: standardTimeoutMs,
    maxAttempts: structuredTaskMaxAttempts,
    model: (models) => models.zhipuTextModel,
  },
  community_post_style_edit: {
    provider: "zhipu",
    capability: "structured_text",
    promptVersion: "community-post-style-edit.v1",
    reasoning: "standard",
    timeoutMs: standardTimeoutMs,
    maxAttempts: structuredTaskMaxAttempts,
    model: (models) => models.zhipuTextModel,
  },
  community_post_evidence_check: {
    provider: "zhipu",
    capability: "multimodal",
    promptVersion: "community-post-evidence-check.v4-style-preservation",
    reasoning: "high",
    timeoutMs: reasoningHeavyTimeoutMs,
    maxAttempts: structuredTaskMaxAttempts,
    model: (models) => models.zhipuVisionModel,
  },
  screenshot_understanding: {
    provider: "zhipu",
    capability: "multimodal",
    promptVersion: "screenshot-understanding.v1",
    reasoning: "high",
    timeoutMs: standardTimeoutMs,
    maxAttempts: structuredTaskMaxAttempts,
    model: (models) => models.zhipuVisionModel,
  },
  ocr: {
    provider: "zhipu",
    capability: "ocr",
    promptVersion: "ocr.v1",
    reasoning: "standard",
    timeoutMs: standardTimeoutMs,
    maxAttempts: structuredTaskMaxAttempts,
    model: (models) => models.zhipuOcrModel,
  },
};

export function resolveAITaskRoute(task: AITaskType): AITaskRoute {
  const template = routeTemplates[task];
  const models = getAIModelEnvironment();
  return { task, provider: template.provider, model: template.model(models), capability: template.capability, promptVersion: template.promptVersion, reasoning: template.reasoning, repairReasoning: template.repairReasoning ?? template.reasoning, timeoutMs: template.timeoutMs, maxAttempts: template.maxAttempts };
}
