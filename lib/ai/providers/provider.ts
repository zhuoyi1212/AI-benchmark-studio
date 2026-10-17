import type {
  AIProviderName,
  ProviderOCRRequest,
  OCRResult,
  ProviderCompletionRequest,
  ProviderCompletionResponse,
  ResearchSource,
  ProviderWebSearchRequest,
  AIMessage,
} from "@/lib/ai/types";

export interface AIProvider {
  readonly name: AIProviderName;
  prepareMessages?(messages: AIMessage[]): AIMessage[];
  generateStructured(request: ProviderCompletionRequest): Promise<ProviderCompletionResponse>;
  searchWeb?(request: ProviderWebSearchRequest): Promise<ResearchSource[]>;
  parseDocument?(request: ProviderOCRRequest): Promise<OCRResult>;
}
