import type {
  AIProviderName,
  ProviderOCRRequest,
  OCRResult,
  ProviderCompletionRequest,
  ProviderCompletionResponse,
  ResearchSource,
  ProviderWebSearchRequest,
} from "@/lib/ai/types";

export interface AIProvider {
  readonly name: AIProviderName;
  generateStructured(request: ProviderCompletionRequest): Promise<ProviderCompletionResponse>;
  searchWeb?(request: ProviderWebSearchRequest): Promise<ResearchSource[]>;
  parseDocument?(request: ProviderOCRRequest): Promise<OCRResult>;
}
