import "server-only";

import type { ZodType } from "zod";
import { AIValidationError } from "@/lib/ai/errors";
import { runOCR, runResearchSearch, runStructuredAITask, selectJudgeTaskForCase } from "@/lib/ai/router";
import type { JudgeArtifactDescriptor, OCRRequest, ResearchSource, StructuredTaskRequest, WebSearchRequest } from "@/lib/ai/types";

type ProductResearchRequest<Schema extends ZodType> = StructuredTaskRequest<Schema> & {
  productName: string;
  searches: WebSearchRequest[];
  allowedDomains?: string[];
  allowedSourceUrls?: string[];
};

async function researchProducts<Schema extends ZodType>({ productName, searches, allowedDomains, allowedSourceUrls = [], ...request }: ProductResearchRequest<Schema>) {
  if (searches.length === 0) throw new Error("Product Research requires at least one source search");
  const searchResults = await Promise.all(searches.map((search) => runResearchSearch(search)));
  const submittedOfficialSources = buildSubmittedOfficialSources(productName, allowedDomains, allowedSourceUrls);
  const sourceGroups = searchResults.map((result) => result.sources.filter((source) => {
    const isPreferredOfficialSource = allowedDomains?.some((domain) => isDomainOrSubdomain(source.url, domain)) ?? false;
    return isPreferredOfficialSource || sourceMentionsProduct(source, productName);
  }));
  const relevantSourceCount = new Set(sourceGroups.flatMap((sources) => sources.map((source) => source.url))).size;
  if (relevantSourceCount < 3) throw new AIValidationError("research", "insufficientRelevantSearchSources");
  if (allowedDomains?.length && ![...sourceGroups.flat(), ...submittedOfficialSources].some((source) => allowedDomains.some((domain) => isDomainOrSubdomain(source.url, domain)))) {
    throw new AIValidationError("research", "officialSearchSourceRequired");
  }
  const relevantSources = interleaveUniqueSources([...sourceGroups, submittedOfficialSources]);
  const officialSources = allowedDomains?.length
    ? relevantSources.filter((source) => allowedDomains.some((domain) => isDomainOrSubdomain(source.url, domain)))
    : [];
  const sources = (officialSources.length >= 3 ? officialSources : relevantSources)
    .slice(0, 20)
    .map((source) => ({ ...source, snippet: source.snippet.slice(0, 3000) }));
  if (sources.length === 0) throw new AIValidationError("research", "nonEmptyTraceableSearchSources");
  const permittedSourceKeys = new Set([...sources.map((source) => source.url), ...allowedSourceUrls].map(canonicalSourceUrl));
  const verifiedResearchSchema = request.schema.superRefine((value, context) => {
    if (!value || typeof value !== "object" || !("sourceUrls" in value) || !Array.isArray(value.sourceUrls)) return;
    value.sourceUrls.forEach((url, index) => {
      if (typeof url === "string" && !permittedSourceKeys.has(canonicalSourceUrl(url))) {
        context.addIssue({ code: "custom", path: ["sourceUrls", index], message: "Source URL must exactly reference one of the retrieved sources" });
      }
    });
  });
  const synthesis = await runStructuredAITask("research", {
    ...request,
    schema: verifiedResearchSchema,
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

function buildSubmittedOfficialSources(productName: string, allowedDomains: string[] | undefined, allowedSourceUrls: string[]): ResearchSource[] {
  if (!allowedDomains?.length) return [];
  return allowedSourceUrls.flatMap((url) => {
    if (!allowedDomains.some((domain) => isDomainOrSubdomain(url, domain))) return [];
    let siteName: string | null = null;
    try {
      siteName = new URL(url).hostname;
    } catch {
      return [];
    }
    return [{
      title: `${productName} 官方网站（用户提交）`,
      url,
      snippet: "创建项目时由用户提交的官方网站。仅用于确认产品身份和官网地址，不得单独用于证明产品功能、价格或能力。",
      siteName,
      publishedAt: null,
    }];
  });
}

function interleaveUniqueSources(groups: ResearchSource[][]) {
  const unique = new Map<string, ResearchSource>();
  const maxLength = Math.max(0, ...groups.map((group) => group.length));
  for (let index = 0; index < maxLength; index += 1) {
    for (const group of groups) {
      const source = group[index];
      if (source && !unique.has(source.url)) unique.set(source.url, source);
    }
  }
  return [...unique.values()];
}

function sourceMentionsProduct(source: ResearchSource, productName: string) {
  const needle = normalizeSearchText(productName);
  if (needle.length < 2) return true;
  return normalizeSearchText(`${source.title} ${source.url} ${source.snippet} ${source.siteName ?? ""}`).includes(needle);
}

function normalizeSearchText(value: string) {
  return value.toLocaleLowerCase("zh-CN").replace(/[^\p{L}\p{N}]+/gu, "");
}

function canonicalSourceUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const pathname = decodeURIComponent(url.pathname).replace(/\/+$/, "") || "/";
    return `${hostname}${pathname}`;
  } catch {
    return value.trim().toLowerCase();
  }
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
  generateProfessionalProtocol: <Schema extends ZodType>(request: StructuredTaskRequest<Schema>) => runStructuredAITask("protocol_professional", request),
  judgeSamples: <Schema extends ZodType>(
    testCaseId: string,
    artifacts: JudgeArtifactDescriptor[],
    request: StructuredTaskRequest<Schema>,
  ) => runStructuredAITask(selectJudgeTaskForCase(testCaseId, artifacts), request),
  analyzeFinalResults: <Schema extends ZodType>(request: StructuredTaskRequest<Schema>) => runStructuredAITask("result_analysis", request),
  generateFindings: <Schema extends ZodType>(request: StructuredTaskRequest<Schema>) => runStructuredAITask("findings", request),
  generateReport: <Schema extends ZodType>(request: StructuredTaskRequest<Schema>) => runStructuredAITask("report", request),
  discoverContentIdeas: <Schema extends ZodType>(request: StructuredTaskRequest<Schema>) => runStructuredAITask("content_discovery", request),
  generateCommunityPost: <Schema extends ZodType>(request: StructuredTaskRequest<Schema>) => runStructuredAITask("community_post", request),
  humanizeCommunityPost: <Schema extends ZodType>(request: StructuredTaskRequest<Schema>) => runStructuredAITask("community_post_humanize", request),
  factCheckTextCommunityPost: <Schema extends ZodType>(request: StructuredTaskRequest<Schema>) => runStructuredAITask("community_post_evidence_check_text", request),
  factCheckCommunityPost: <Schema extends ZodType>(request: StructuredTaskRequest<Schema>) => runStructuredAITask("community_post_evidence_check", request),
  understandScreenshots: <Schema extends ZodType>(request: StructuredTaskRequest<Schema>) => runStructuredAITask("screenshot_understanding", request),
  extractArtifactText: (request: OCRRequest) => runOCR(request),
} satisfies Record<string, (...args: never[]) => unknown>;

export type ProductSourceSearchRequest = WebSearchRequest;
