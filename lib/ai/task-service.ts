import "server-only";

import type { ZodType } from "zod";
import { AIValidationError } from "@/lib/ai/errors";
import { runOCR, runResearchSearch, runStructuredAITask, selectJudgeTaskForCase } from "@/lib/ai/router";
import type { JudgeArtifactDescriptor, OCRRequest, StructuredTaskRequest, WebSearchRequest } from "@/lib/ai/types";

type ProductResearchRequest<Schema extends ZodType> = StructuredTaskRequest<Schema> & {
  searches: WebSearchRequest[];
  allowedDomains?: string[];
};

async function researchProducts<Schema extends ZodType>({ searches, allowedDomains, ...request }: ProductResearchRequest<Schema>) {
  if (searches.length === 0) throw new Error("Product Research requires at least one source search");
  const searchResults = await Promise.all(searches.map((search) => runResearchSearch(search)));
  const retrievedSources = [...new Map(
    searchResults.flatMap((result) => result.sources).map((source) => [source.url, source]),
  ).values()];
  const sources = retrievedSources
    .filter((source) => !allowedDomains?.length || allowedDomains.some((domain) => isDomainOrSubdomain(source.url, domain)))
    .slice(0, 18)
    .map((source) => ({ ...source, snippet: source.snippet.slice(0, 3000) }));
  if (sources.length === 0) throw new AIValidationError("research", "nonEmptyTraceableSearchSources");
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
  return { ...synthesis, sources, searchRoute: searchResults[0]!.route };
}

function isDomainOrSubdomain(value: string, allowedDomain: string) {
  try {
    const hostname = new URL(value).hostname.replace(/^www\./, "").toLowerCase();
    const normalizedAllowed = allowedDomain.replace(/^www\./, "").toLowerCase();
    return hostname === normalizedAllowed || hostname.endsWith(`.${normalizedAllowed}`);
  } catch {
    return false;
  }
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
