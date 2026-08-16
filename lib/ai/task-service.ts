import "server-only";

import type { ZodType } from "zod";
import { runOCR, runResearchSearch, runStructuredAITask, selectJudgeTaskForCase } from "@/lib/ai/router";
import type { JudgeArtifactDescriptor, OCRRequest, StructuredTaskRequest, WebSearchRequest } from "@/lib/ai/types";

type ProductResearchRequest<Schema extends ZodType> = StructuredTaskRequest<Schema> & {
  searches: WebSearchRequest[];
};

async function researchProducts<Schema extends ZodType>({ searches, ...request }: ProductResearchRequest<Schema>) {
  if (searches.length === 0) throw new Error("Product Research requires at least one source search");
  const searchResults = await Promise.all(searches.map((search) => runResearchSearch(search)));
  const sources = [...new Map(
    searchResults.flatMap((result) => result.sources).map((source) => [source.url, source]),
  ).values()];
  const synthesis = await runStructuredAITask("research", {
    ...request,
    messages: [
      ...request.messages,
      {
        role: "user",
        content: `Use only these retrieved sources for product facts and preserve source URLs in the result: ${JSON.stringify(sources)}`,
      },
    ],
  });
  return { ...synthesis, sources };
}

export const aiTaskService = {
  researchProducts,
  evaluateComparability: <Schema extends ZodType>(request: StructuredTaskRequest<Schema>) => runStructuredAITask("comparability", request),
  generateProtocol: <Schema extends ZodType>(request: StructuredTaskRequest<Schema>) => runStructuredAITask("protocol", request),
  judgeSamples: <Schema extends ZodType>(
    testCaseId: string,
    artifacts: JudgeArtifactDescriptor[],
    request: StructuredTaskRequest<Schema>,
  ) => runStructuredAITask(selectJudgeTaskForCase(testCaseId, artifacts), request),
  analyzeFinalResults: <Schema extends ZodType>(request: StructuredTaskRequest<Schema>) => runStructuredAITask("result_analysis", request),
  generateReport: <Schema extends ZodType>(request: StructuredTaskRequest<Schema>) => runStructuredAITask("report", request),
  discoverContentIdeas: <Schema extends ZodType>(request: StructuredTaskRequest<Schema>) => runStructuredAITask("content_discovery", request),
  generateCommunityPost: <Schema extends ZodType>(request: StructuredTaskRequest<Schema>) => runStructuredAITask("community_post", request),
  understandScreenshots: <Schema extends ZodType>(request: StructuredTaskRequest<Schema>) => runStructuredAITask("screenshot_understanding", request),
  extractArtifactText: (request: OCRRequest) => runOCR(request),
} satisfies Record<string, (...args: never[]) => unknown>;

export type ProductSourceSearchRequest = WebSearchRequest;
