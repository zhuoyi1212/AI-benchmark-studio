import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
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
  const submittedOfficialSources = await buildSubmittedOfficialSources(productName, allowedDomains, allowedSourceUrls);
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

async function buildSubmittedOfficialSources(productName: string, allowedDomains: string[] | undefined, allowedSourceUrls: string[]): Promise<ResearchSource[]> {
  if (!allowedDomains?.length) return [];
  const sources = await Promise.all(allowedSourceUrls.map(async (url) => {
    if (!allowedDomains.some((domain) => isDomainOrSubdomain(url, domain))) return [];
    let siteName: string | null = null;
    try {
      siteName = new URL(url).hostname;
    } catch {
      return [];
    }
    const page = await fetchOfficialPage(url).catch(() => null);
    return [{
      title: page?.title || `${productName} 官方网站（用户提交）`,
      url,
      snippet: page?.content || "创建项目时由用户提交的官方网站。仅用于确认产品身份和官网地址，不得单独用于证明产品功能、价格或能力。",
      siteName,
      publishedAt: null,
    }];
  }));
  return sources.flat();
}

async function fetchOfficialPage(value: string): Promise<{ title: string; content: string } | null> {
  let currentUrl = new URL(value);
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    await assertPublicHostname(currentUrl.hostname);
    const response = await fetch(currentUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
      headers: { accept: "text/html,application/xhtml+xml", "user-agent": "AI-Benchmark-Studio-Research/1.0" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      currentUrl = new URL(location, currentUrl);
      continue;
    }
    if (!response.ok || !response.headers.get("content-type")?.toLowerCase().includes("text/html")) return null;
    const html = await readLimitedText(response, 1_000_000);
    const title = extractHtmlTitle(html);
    const content = extractOfficialPageContent(html);
    return content.length >= 40 ? { title, content } : null;
  }
  return null;
}

async function assertPublicHostname(hostname: string): Promise<void> {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local")) {
    throw new Error("Official website hostname is not public");
  }
  const addresses = isIP(normalized) ? [{ address: normalized }] : await lookup(normalized, { all: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("Official website resolves to a non-public address");
  }
}

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  const ipv4 = normalized.startsWith("::ffff:") ? normalized.slice(7) : normalized;
  if (isIP(ipv4) !== 4) return false;
  const [first, second] = ipv4.split(".").map(Number);
  return first === 0 || first === 10 || first === 127 || first >= 224
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168);
}

async function readLimitedText(response: Response, byteLimit: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > byteLimit) {
      await reader.cancel();
      break;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function extractHtmlTitle(html: string): string {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "官方网站";
  return decodeHtmlText(title).slice(0, 300);
}

function extractOfficialPageContent(html: string): string {
  const descriptions = [...html.matchAll(/<meta\b[^>]*>/gi)].flatMap(([tag]) => {
    const key = readHtmlAttribute(tag, "name") ?? readHtmlAttribute(tag, "property");
    if (!key || !["description", "og:description"].includes(key.toLowerCase())) return [];
    const content = readHtmlAttribute(tag, "content");
    return content ? [content] : [];
  });
  const visibleText = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeHtmlText([...descriptions, visibleText].join("\n")).slice(0, 12_000);
}

function readHtmlAttribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function decodeHtmlText(value: string): string {
  const namedEntities: Record<string, string> = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: "\"" };
  return value
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_match, entity: string) => {
      if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
      if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
      return namedEntities[entity.toLowerCase()] ?? `&${entity};`;
    })
    .replace(/\s+/g, " ")
    .trim();
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
  generateCommunityPostTitle: <Schema extends ZodType>(request: StructuredTaskRequest<Schema>) => runStructuredAITask("community_post_title", request),
  factCheckTextCommunityPost: <Schema extends ZodType>(request: StructuredTaskRequest<Schema>) => runStructuredAITask("community_post_evidence_check_text", request),
  factCheckCommunityPost: <Schema extends ZodType>(request: StructuredTaskRequest<Schema>) => runStructuredAITask("community_post_evidence_check", request),
  understandScreenshots: <Schema extends ZodType>(request: StructuredTaskRequest<Schema>) => runStructuredAITask("screenshot_understanding", request),
  extractArtifactText: (request: OCRRequest) => runOCR(request),
} satisfies Record<string, (...args: never[]) => unknown>;

export type ProductSourceSearchRequest = WebSearchRequest;
