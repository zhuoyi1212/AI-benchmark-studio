import "server-only";

import { getAIModelEnvironment } from "@/lib/env/server";
import type { AICapability, AIProviderName, AITaskRoute, AITaskType } from "@/lib/ai/types";

type RouteTemplate = {
  provider: AIProviderName;
  capability: AICapability;
  promptVersion: string;
  model: (models: ReturnType<typeof getAIModelEnvironment>) => string;
};

const routeTemplates: Record<AITaskType, RouteTemplate> = {
  research_search: {
    provider: "zhipu",
    capability: "web_search",
    promptVersion: "research-search.v1",
    model: () => "search_pro",
  },
  research: {
    provider: "zhipu",
    capability: "structured_text",
    promptVersion: "research-synthesis.v1",
    model: (models) => models.zhipuTextModel,
  },
  comparability: {
    provider: "deepseek",
    capability: "structured_text",
    promptVersion: "comparability.v1",
    model: (models) => models.deepSeekReasoningModel,
  },
  protocol: {
    provider: "deepseek",
    capability: "structured_text",
    promptVersion: "protocol.v1",
    model: (models) => models.deepSeekReasoningModel,
  },
  judge_text: {
    provider: "deepseek",
    capability: "structured_text",
    promptVersion: "judge.v1",
    model: (models) => models.deepSeekReasoningModel,
  },
  judge_multimodal: {
    provider: "zhipu",
    capability: "multimodal",
    promptVersion: "judge.v1",
    model: (models) => models.zhipuVisionModel,
  },
  result_analysis: {
    provider: "deepseek",
    capability: "structured_text",
    promptVersion: "result-analysis.v1",
    model: (models) => models.deepSeekReasoningModel,
  },
  report: {
    provider: "zhipu",
    capability: "structured_text",
    promptVersion: "report.v1",
    model: (models) => models.zhipuTextModel,
  },
  content_discovery: {
    provider: "deepseek",
    capability: "structured_text",
    promptVersion: "content-discovery.v1",
    model: (models) => models.deepSeekReasoningModel,
  },
  community_post: {
    provider: "zhipu",
    capability: "structured_text",
    promptVersion: "community-post.v1",
    model: (models) => models.zhipuTextModel,
  },
  screenshot_understanding: {
    provider: "zhipu",
    capability: "multimodal",
    promptVersion: "screenshot-understanding.v1",
    model: (models) => models.zhipuVisionModel,
  },
  ocr: {
    provider: "zhipu",
    capability: "ocr",
    promptVersion: "ocr.v1",
    model: (models) => models.zhipuOcrModel,
  },
};

export function resolveAITaskRoute(task: AITaskType): AITaskRoute {
  const template = routeTemplates[task];
  const models = getAIModelEnvironment();
  return { task, provider: template.provider, model: template.model(models), capability: template.capability, promptVersion: template.promptVersion };
}
