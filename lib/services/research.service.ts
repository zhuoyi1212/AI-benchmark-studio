import "server-only";

import { z } from "zod";
import { AIProviderError, AIValidationError } from "@/lib/ai/errors";
import {
  comparabilityResultSchema,
  productResearchSynthesisSchema,
  type ProductResearchSynthesis,
} from "@/lib/ai/schemas/research.schemas";
import { aiTaskService } from "@/lib/ai/task-service";
import type { AIUsage, AITaskRoute, ResearchSource as AIRetrievedSource } from "@/lib/ai/types";
import { RepositoryError } from "@/lib/repositories/repository-error";
import { researchRepository, type ProductResearchWrite } from "@/lib/repositories/research.repository";
import { createInputSignature } from "@/lib/signatures";
import { getProjectMode } from "@/lib/project-mode";
import { getProjectSummary, type ProjectProductSummary, type ProjectSummary } from "@/lib/services/projects.service";
import type { Json, ProductResearchRow, ResearchRunRow } from "@/lib/types/database";
import type { ComparabilityResult, ProductResearch, ResearchResponse, ResearchSource } from "@/lib/types/research";

const storedSourceSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  sourceType: z.enum(["official_website", "documentation", "pricing", "help_center", "blog", "other"]),
  snippet: z.string(),
  siteName: z.string().nullable(),
  publishedAt: z.string().nullable(),
});
const storedSourcesSchema = z.array(storedSourceSchema).min(1);
const storedTextListSchema = z.array(z.string());
const storedPricingSchema = productResearchSynthesisSchema.shape.pricing;

export type ResearchWorkspace = {
  project: ProjectSummary;
  latestRun: ResearchRunRow | null;
  completedResult: ResearchResponse | null;
  runCount: number;
};

type CompletedProductResearch = {
  write: ProductResearchWrite;
  route: AITaskRoute;
  searchRoute: AITaskRoute;
  usage: AIUsage;
};

export class ResearchExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchExecutionError";
  }
}

export async function getResearchWorkspace(projectId: string): Promise<ResearchWorkspace | null> {
  const project = await getProjectSummary(projectId);
  if (!project) return null;
  const runs = await researchRepository.listRuns(projectId);
  const completedRun = runs.find((run) => run.status === "completed") ?? null;
  return {
    project,
    latestRun: runs[0] ?? null,
    completedResult: completedRun ? await readCompletedResult(project, completedRun) : null,
    runCount: runs.length,
  };
}

export async function executeProductResearch(projectId: string): Promise<string> {
  const project = await getProjectSummary(projectId);
  if (!project) throw new ResearchExecutionError("项目不存在或已归档。 ");
  if (project.products.length < 1 || project.products.length > 3) {
    throw new ResearchExecutionError("产品调研要求项目包含 1–3 个产品。");
  }

  const inputSnapshot = {
    projectId: project.id,
    intent: project.intent,
    products: project.products.map(({ id, name, officialUrl }) => ({ id, name, officialUrl })),
  } satisfies Json;
  const inputSignature = createInputSignature(inputSnapshot);
  const projectMode = getProjectMode(project.products);
  let researchRunId: string | null = null;

  try {
    const activeRunId = await researchRepository.begin(project.id, inputSnapshot, inputSignature);
    researchRunId = activeRunId;
    const completedProducts = await Promise.all(
      project.products.map((product) => researchOneProduct(project, product, activeRunId)),
    );

    await researchRepository.insertProductResearch(completedProducts.map((item) => item.write));
    const persistedResearch = await researchRepository.listProductResearch(activeRunId);
    const comparability = await aiTaskService.evaluateComparability({
      schema: comparabilityResultSchema,
      schemaName: "ComparabilityResult",
      messages: [
        {
          role: "system",
          content: projectMode === "single"
            ? "你是 AI 产品体验研究的实验设计分析师。只基于已保存 ProductResearch 提炼这一个产品可被真实体验验证的核心能力、边界与风险，不搜索、不补充外部事实。Comparability 仅作为兼容元数据，不决定单产品流程是否继续。输出简体中文。"
            : "你是 AI 产品横向测评的实验设计分析师。只基于提供的已保存 ProductResearch 判断可比性，不搜索、不补充外部事实。输出简体中文。",
        },
        {
          role: "user",
          content: JSON.stringify({
            projectIntent: project.intent,
            projectMode,
            productResearch: persistedResearch.map(toComparabilityInput),
            requirements: {
              statuses: ["comparable", "partially_comparable", "not_comparable"],
              identifyCommonCapabilities: projectMode === "comparison",
              identifyTestableCoreCapabilities: projectMode === "single",
              identifyUnfairComparisonRisks: projectMode === "comparison",
              comparabilityDoesNotGateSingleProductExperience: projectMode === "single",
            },
          }),
        },
      ],
      maxTokens: 6000,
    });

    const synthesisRoute = requireSingleRoute(completedProducts.map((item) => item.route), "Research synthesis");
    const searchRoute = requireSingleRoute(completedProducts.map((item) => item.searchRoute), "Research search");
    await researchRepository.complete({
      researchRunId: activeRunId,
      searchRoute,
      synthesisRoute,
      synthesisUsage: sumUsage(completedProducts.map((item) => item.usage)),
      comparabilityRoute: comparability.route,
      comparabilityUsage: comparability.usage,
      comparability: comparability.data,
    });
    return activeRunId;
  } catch (error) {
    if (researchRunId) {
      try {
        await researchRepository.fail(researchRunId, getSafeFailureMessage(error));
      } catch {
        // Preserve the original execution error; the active run remains visible for operational recovery.
      }
    }
    if (error instanceof ResearchExecutionError) throw error;
    throw new ResearchExecutionError(toUserFacingError(error));
  }
}

async function researchOneProduct(
  project: ProjectSummary,
  product: ProjectProductSummary,
  researchRunId: string,
): Promise<CompletedProductResearch> {
  const result = await aiTaskService.researchProducts({
    searches: buildSearches(product),
    allowedDomains: getHostname(product.officialUrl) ? [getHostname(product.officialUrl)!] : undefined,
    schema: productResearchSynthesisSchema,
    schemaName: "ProductResearch",
    messages: [
      {
        role: "system",
        content: "你是严谨的 AI 产品研究员。只允许使用随后提供的检索来源陈述产品事实；价格、免费方案和能力必须可追溯。不要依据记忆补充。输出简体中文。sourceUrls 只能逐字引用给定 URL。",
      },
      {
        role: "user",
        content: JSON.stringify({
          projectIntent: project.intent,
          product: { name: product.name, submittedOfficialUrl: product.officialUrl },
          requestedFields: ["positioning", "targetUsers", "capabilities", "keyFeatures", "pricing", "officialBestPractices", "limitations", "sourceUrls"],
        }),
      },
    ],
    maxTokens: 7000,
  });
  const sources = selectVerifiedSources(result.data, result.sources, product);
  return {
    route: result.route,
    searchRoute: result.searchRoute,
    usage: result.usage,
    write: {
      project_id: project.id,
      research_run_id: researchRunId,
      product_id: product.id,
      positioning: result.data.positioning,
      target_users: result.data.targetUsers,
      capabilities: result.data.capabilities,
      key_features: result.data.keyFeatures,
      pricing: result.data.pricing,
      official_best_practices: result.data.officialBestPractices,
      limitations: result.data.limitations,
      sources,
    },
  };
}

function buildSearches(product: ProjectProductSummary) {
  const site = getHostname(product.officialUrl);
  const scope = site ? `site:${site}` : "official";
  return [
    { query: `${scope} ${product.name} product overview official documentation`, count: 8 },
    { query: `${scope} ${product.name} pricing free plan`, count: 8 },
    { query: `${scope} ${product.name} help center release notes blog`, count: 8 },
  ];
}

function selectVerifiedSources(
  synthesis: ProductResearchSynthesis,
  retrieved: AIRetrievedSource[],
  product: ProjectProductSummary,
): ResearchSource[] {
  const retrievedByUrl = new Map(retrieved.map((source) => [normalizeUrl(source.url), source]));
  const selected = [...new Set(synthesis.sourceUrls.map(normalizeUrl))].map((url) => retrievedByUrl.get(url));
  if (selected.some((source) => !source)) {
    throw new AIValidationError("research", "sourceUrlsMustReferenceRetrievedSources");
  }
  const verified = selected.filter((source): source is AIRetrievedSource => Boolean(source));
  if (verified.length === 0) throw new AIValidationError("research", "nonEmptyVerifiedSources");

  const officialHostname = getHostname(product.officialUrl);
  if (officialHostname && !verified.some((source) => isDomainOrSubdomain(source.url, officialHostname))) {
    throw new AIValidationError("research", "officialSourceRequired");
  }
  return verified.map((source) => ({
    title: source.title,
    url: source.url,
    snippet: source.snippet,
    siteName: source.siteName,
    publishedAt: source.publishedAt,
    sourceType: classifySource(source.url, source.title, officialHostname),
  }));
}

async function readCompletedResult(project: ProjectSummary, run: ResearchRunRow): Promise<ResearchResponse> {
  const comparability = comparabilityResultSchema.safeParse(run.comparability);
  if (!comparability.success) throw new ResearchExecutionError("已保存的可比性结果无法通过校验。");
  const rows = await researchRepository.listProductResearch(run.id);
  const rowsByProduct = new Map(rows.map((row) => [row.product_id, row]));
  return {
    projectId: project.id,
    researchRunId: run.id,
    version: run.version,
    products: project.products.map((product) => mapStoredProduct(product, requireProductRow(rowsByProduct.get(product.id)))),
    comparability: comparability.data,
    generatedAt: run.completed_at ?? run.updated_at,
  };
}

function mapStoredProduct(product: ProjectProductSummary, row: ProductResearchRow): ProductResearch {
  return {
    productId: product.id,
    name: product.name,
    officialUrl: product.officialUrl ?? undefined,
    initials: product.initials,
    positioning: row.positioning,
    targetUsers: storedTextListSchema.parse(row.target_users),
    capabilities: storedTextListSchema.parse(row.capabilities),
    keyFeatures: storedTextListSchema.parse(row.key_features),
    pricing: mapStoredPricing(storedPricingSchema.parse(row.pricing)),
    officialBestPractices: storedTextListSchema.parse(row.official_best_practices),
    limitations: storedTextListSchema.parse(row.limitations),
    sources: storedSourcesSchema.parse(row.sources),
  };
}

function toComparabilityInput(row: ProductResearchRow) {
  return {
    productId: row.product_id,
    positioning: row.positioning,
    targetUsers: row.target_users,
    capabilities: row.capabilities,
    keyFeatures: row.key_features,
    pricing: row.pricing,
    limitations: row.limitations,
    sources: row.sources,
  };
}

function requireProductRow(row: ProductResearchRow | undefined) {
  if (!row) throw new ResearchExecutionError("已完成的 ResearchRun 缺少产品调研记录。");
  return row;
}

function mapStoredPricing(pricing: z.infer<typeof storedPricingSchema>) {
  if (!pricing) return undefined;
  return {
    summary: pricing.summary,
    freePlan: pricing.freePlan ?? undefined,
    paidFrom: pricing.paidFrom ?? undefined,
    currency: pricing.currency ?? undefined,
  };
}

function requireSingleRoute(routes: AITaskRoute[], task: string) {
  const first = routes[0];
  if (!first || routes.some((route) => route.provider !== first.provider || route.model !== first.model || route.promptVersion !== first.promptVersion)) {
    throw new ResearchExecutionError(`${task} 路由不一致。`);
  }
  return first;
}

function sumUsage(items: AIUsage[]): AIUsage {
  return {
    inputTokens: sumNullable(items.map((item) => item.inputTokens)),
    outputTokens: sumNullable(items.map((item) => item.outputTokens)),
    latencyMs: items.reduce((sum, item) => sum + item.latencyMs, 0),
    estimatedCost: sumNullable(items.map((item) => item.estimatedCost)),
  };
}

function sumNullable(values: Array<number | null>) {
  return values.every((value) => value === null) ? null : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function classifySource(url: string, title: string, officialHostname: string | null): ResearchSource["sourceType"] {
  const haystack = `${url} ${title}`.toLowerCase();
  if (/pricing|plans|price/.test(haystack)) return "pricing";
  if (/help|support|knowledge/.test(haystack)) return "help_center";
  if (/docs|documentation|developer/.test(haystack)) return "documentation";
  if (/blog|release|changelog|news/.test(haystack)) return "blog";
  if (officialHostname && isDomainOrSubdomain(url, officialHostname)) return "official_website";
  return "other";
}

function normalizeUrl(value: string) {
  const url = new URL(value);
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function getHostname(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function isDomainOrSubdomain(value: string, allowedDomain: string) {
  const hostname = getHostname(value);
  return hostname === allowedDomain || Boolean(hostname?.endsWith(`.${allowedDomain}`));
}

function getSafeFailureMessage(error: unknown) {
  if (error instanceof AIProviderError) return `AI provider request failed: ${error.provider}${error.status ? ` (${error.status})` : ""}`;
  if (error instanceof AIValidationError) return `AI output validation failed: ${error.schemaName}`;
  if (error instanceof RepositoryError) return `Database operation failed: ${error.operation}`;
  if (error instanceof ResearchExecutionError) return error.message;
  return "Unexpected product research failure";
}

function toUserFacingError(error: unknown) {
  if (error instanceof AIProviderError) return "AI 服务调用失败，本次 ResearchRun 已记录，可稍后重试。";
  if (error instanceof AIValidationError) return "AI 返回结果未通过结构校验，本次 ResearchRun 已记录，可重新调研。";
  if (error instanceof RepositoryError && error.operation === "research.begin") return "当前项目可能已有调研任务运行，请刷新后查看。";
  if (error instanceof RepositoryError) return "调研数据保存失败，本次运行状态已保留。";
  return "产品调研未完成，请稍后重试。";
}
