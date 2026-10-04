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
import type { Json, ProductResearchRow, ProductResearchSnapshotRow, ResearchRunRow } from "@/lib/types/database";
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
  reuseSummary: {
    reusedCount: number;
    freshCount: number;
    staleCount: number;
  } | null;
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
  const [project, runs] = await Promise.all([getProjectSummary(projectId), researchRepository.listRuns(projectId)]);
  if (!project) return null;
  const completedRun = runs.find((run) => run.status === "completed") ?? null;
  return {
    project,
    latestRun: runs[0] ?? null,
    completedResult: completedRun ? await readCompletedResult(project, completedRun) : null,
    runCount: runs.length,
    reuseSummary: completedRun ? readReuseSummary(completedRun) : null,
  };
}

export async function executeProductResearch(
  projectId: string,
  options: { forceRefresh?: boolean } = {},
): Promise<string> {
  const project = await getProjectSummary(projectId);
  if (!project) throw new ResearchExecutionError("项目不存在或已归档。 ");
  if (project.products.length < 1 || project.products.length > 3) {
    throw new ResearchExecutionError("产品调研要求项目包含 1–3 个产品。");
  }

  const latestSnapshots = options.forceRefresh
    ? []
    : await researchRepository.listLatestSnapshots(project.products.map((product) => product.id));
  const snapshotsByProduct = new Map(latestSnapshots.map((snapshot) => [snapshot.product_id, snapshot]));
  const freshProducts = project.products.filter((product) => !snapshotsByProduct.has(product.id));
  const reusedSnapshots = project.products
    .map((product) => snapshotsByProduct.get(product.id))
    .filter((snapshot): snapshot is ProductResearchSnapshotRow => Boolean(snapshot));
  const inputSnapshot = {
    projectId: project.id,
    intent: project.intent,
    evaluationMode: project.evaluationMode,
    products: project.products.map(({ id, name, officialUrl }) => ({ id, name, officialUrl })),
    researchReuse: reusedSnapshots.map((snapshot) => ({
      productId: snapshot.product_id,
      snapshotId: snapshot.id,
      version: snapshot.version,
      validUntil: snapshot.valid_until,
    })),
    forceRefresh: options.forceRefresh === true,
  } satisfies Json;
  const inputSignature = createInputSignature(inputSnapshot);
  const projectMode = getProjectMode(project.products);
  let researchRunId: string | null = null;

  try {
    const activeRunId = await researchRepository.begin(project.id, inputSnapshot, inputSignature);
    researchRunId = activeRunId;
    await researchRepository.recordReuseDetails(activeRunId, {
      reused: reusedSnapshots.map((snapshot) => ({
        productId: snapshot.product_id,
        snapshotId: snapshot.id,
        version: snapshot.version,
        researchedAt: snapshot.researched_at,
        validUntil: snapshot.valid_until,
        stale: isSnapshotStale(snapshot),
        searchProvider: snapshot.search_provider,
        searchModel: snapshot.search_model,
        searchPromptVersion: snapshot.search_prompt_version,
        synthesisProvider: snapshot.synthesis_provider,
        synthesisModel: snapshot.synthesis_model,
        synthesisPromptVersion: snapshot.synthesis_prompt_version,
      })),
      freshProductIds: freshProducts.map((product) => product.id),
      forceRefresh: options.forceRefresh === true,
    });
    const completedProducts = await Promise.all(
      freshProducts.map((product) => researchOneProduct(project, product, activeRunId)),
    );

    await researchRepository.insertProductResearch([
      ...reusedSnapshots.map((snapshot) => snapshotToProjectResearch(snapshot, project.id, activeRunId)),
      ...completedProducts.map((item) => item.write),
    ]);
    const persistedResearch = await researchRepository.listProductResearch(activeRunId);
    const validatedComparabilitySchema = comparabilityResultSchema.superRefine((result, context) => {
      if (result.commonCapabilities.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["commonCapabilities"],
          message: projectMode === "single"
            ? "Single-product research must list at least one testable core capability"
            : "Comparison research must list at least one shared capability",
        });
      }
    });
    const comparability = await aiTaskService.evaluateComparability({
      schema: validatedComparabilitySchema,
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

    const synthesisRoute = completedProducts.length > 0
      ? requireSingleRoute(completedProducts.map((item) => item.route), "Research synthesis")
      : snapshotSynthesisRoute(requireSnapshot(reusedSnapshots[0]));
    const searchRoute = completedProducts.length > 0
      ? requireSingleRoute(completedProducts.map((item) => item.searchRoute), "Research search")
      : snapshotSearchRoute(requireSnapshot(reusedSnapshots[0]));
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
    productName: product.name,
    searches: buildSearches(product),
    allowedDomains: getHostname(product.officialUrl) ? [getHostname(product.officialUrl)!] : undefined,
    allowedSourceUrls: product.officialUrl ? [product.officialUrl] : [],
    schema: productResearchSynthesisSchema,
    schemaName: "ProductResearch",
    messages: [
      {
        role: "system",
        content: "你是严谨的 AI 产品研究员。只允许使用随后提供的检索来源陈述产品事实，不得依据记忆补充。优先使用提交官网域名内的产品页、文档、帮助中心、更新日志和定价页；二手来源只能补充官方资料未覆盖的体验或背景，不能覆盖官方事实。positioning 直接说明产品是什么、面向谁、解决什么问题，不要用“无法确认”“未找到信息”等检索说明代替产品定位；缺失信息写入 limitations。必须核对实际交互限制：输入框字符上限、是否支持文件上传、支持的文件类型及单文件限制；有明确字符上限时在 limitations 中原样写出数值和单位，不支持上传时明确写“不支持上传文件”。inputFormats 只填写来源明确支持的输入方式，未知不能猜测。价格、免费方案和套餐结论只有在给定来源中存在官方定价或官方帮助页面时才可填写，否则 pricing 返回 null。输出简体中文。sourceUrls 只能逐字引用给定 URL，并应优先选择高质量官方来源。",
      },
      {
        role: "user",
        content: JSON.stringify({
          projectIntent: project.intent,
          product: { name: product.name, submittedOfficialUrl: product.officialUrl },
          requestedFields: ["positioning", "targetUsers", "capabilities", "keyFeatures", "pricing", "officialBestPractices", "limitations including prompt character limits and file-upload support", "inputFormats from explicit source evidence", "outputFormats", "sourceUrls"],
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
      input_formats: result.data.inputFormats,
      output_formats: result.data.outputFormats,
      sources,
      snapshot_id: null,
      reused_from_snapshot: false,
    },
  };
}

function buildSearches(product: ProjectProductSummary) {
  const site = getHostname(product.officialUrl);
  if (!site) {
    const exactName = `"${product.name}"`;
    return [
      { query: `${exactName} AI 公司 官方`, count: 8 },
      { query: `${exactName} AI 助手 官网 官方文档`, count: 8 },
      { query: `${exactName} AI 产品 功能 使用指南`, count: 8 },
      { query: `${exactName} 输入限制 字符上限 文件上传 官方`, count: 8 },
    ];
  }
  const scope = `site:${site}`;
  const exactName = `"${product.name}"`;
  return [
    { query: `${scope} ${exactName} 产品 功能 官方文档`, count: 8 },
    { query: `${scope} ${exactName} 使用指南 release notes pricing`, count: 8 },
    { query: `${exactName} AI 产品 官方文档 功能 使用指南`, count: 8 },
    { query: `${scope} ${exactName} 输入限制 字符上限 文件上传`, count: 8 },
  ];
}

function selectVerifiedSources(
  synthesis: ProductResearchSynthesis,
  retrieved: AIRetrievedSource[],
  product: ProjectProductSummary,
): ResearchSource[] {
  const retrievedByUrl = new Map(retrieved.map((source) => [normalizeUrl(source.url), source]));
  const retrievedByCanonicalUrl = new Map(retrieved.map((source) => [canonicalResearchUrl(source.url), source]));
  const submittedOfficialUrl = product.officialUrl ? normalizeUrl(product.officialUrl) : null;
  const selected = [...new Set(synthesis.sourceUrls.map(normalizeUrl))].map((url) => {
    const retrievedSource = retrievedByUrl.get(url) ?? retrievedByCanonicalUrl.get(canonicalResearchUrl(url));
    if (retrievedSource) return retrievedSource;
    if (submittedOfficialUrl === url) {
      return {
        title: `${product.name} 官方网站`,
        url: product.officialUrl!,
        snippet: "创建项目时提交并限定检索域名的产品官方网站。",
        siteName: getHostname(product.officialUrl),
        publishedAt: null,
      } satisfies AIRetrievedSource;
    }
    return undefined;
  });
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
  const explicitSnapshotIds = rows
    .map((row) => row.snapshot_id)
    .filter((id): id is string => Boolean(id));
  const snapshots = [
    ...await researchRepository.listSnapshotsByIds(explicitSnapshotIds),
    ...await researchRepository.listLatestSnapshots(rows.map((row) => row.product_id)),
  ];
  const snapshotsById = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const snapshotsByOrigin = new Map(
    snapshots
      .filter((snapshot) => snapshot.origin_product_research_id)
      .map((snapshot) => [snapshot.origin_product_research_id!, snapshot]),
  );
  const rowsByProduct = new Map(rows.map((row) => [row.product_id, row]));
  return {
    projectId: project.id,
    researchRunId: run.id,
    version: run.version,
    products: project.products.map((product) => {
      const row = requireProductRow(rowsByProduct.get(product.id));
      const snapshot = row.snapshot_id ? snapshotsById.get(row.snapshot_id) : snapshotsByOrigin.get(row.id);
      return mapStoredProduct(product, row, snapshot);
    }),
    comparability: comparability.data,
    generatedAt: run.completed_at ?? run.updated_at,
  };
}

function mapStoredProduct(
  product: ProjectProductSummary,
  row: ProductResearchRow,
  snapshot: ProductResearchSnapshotRow | undefined,
): ProductResearch {
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
    inputFormats: storedTextListSchema.parse(row.input_formats),
    outputFormats: storedTextListSchema.parse(row.output_formats),
    sources: storedSourcesSchema.parse(row.sources),
    snapshot: snapshot ? {
      id: snapshot.id,
      version: snapshot.version,
      researchedAt: snapshot.researched_at,
      validUntil: snapshot.valid_until,
      reused: row.reused_from_snapshot,
      stale: isSnapshotStale(snapshot),
    } : undefined,
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
    inputFormats: row.input_formats,
    outputFormats: row.output_formats,
    sources: row.sources,
  };
}

function snapshotToProjectResearch(
  snapshot: ProductResearchSnapshotRow,
  projectId: string,
  researchRunId: string,
): ProductResearchWrite {
  return {
    project_id: projectId,
    research_run_id: researchRunId,
    product_id: snapshot.product_id,
    positioning: snapshot.positioning,
    target_users: snapshot.target_users,
    capabilities: snapshot.capabilities,
    key_features: snapshot.key_features,
    pricing: snapshot.pricing,
    official_best_practices: snapshot.official_best_practices,
    limitations: snapshot.limitations,
    input_formats: snapshot.input_formats,
    output_formats: snapshot.output_formats,
    sources: snapshot.sources,
    snapshot_id: snapshot.id,
    reused_from_snapshot: true,
  };
}

function snapshotSearchRoute(snapshot: ProductResearchSnapshotRow) {
  return {
    provider: snapshot.search_provider,
    model: snapshot.search_model,
    promptVersion: snapshot.search_prompt_version,
  };
}

function snapshotSynthesisRoute(snapshot: ProductResearchSnapshotRow) {
  return {
    provider: snapshot.synthesis_provider,
    model: snapshot.synthesis_model,
    promptVersion: snapshot.synthesis_prompt_version,
  };
}

function requireSnapshot(snapshot: ProductResearchSnapshotRow | undefined) {
  if (!snapshot) throw new ResearchExecutionError("调研运行既没有可复用快照，也没有需要重新调研的产品。");
  return snapshot;
}

function isSnapshotStale(snapshot: ProductResearchSnapshotRow) {
  return Date.parse(snapshot.valid_until) <= Date.now();
}

function readReuseSummary(run: ResearchRunRow) {
  const details = z.object({
    reused: z.array(z.object({ stale: z.boolean() })).default([]),
    freshProductIds: z.array(z.string()).default([]),
  }).safeParse(run.reuse_details);
  if (!details.success) return { reusedCount: 0, freshCount: 0, staleCount: 0 };
  return {
    reusedCount: details.data.reused.length,
    freshCount: details.data.freshProductIds.length,
    staleCount: details.data.reused.filter((item) => item.stale).length,
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

function canonicalResearchUrl(value: string) {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  const pathname = decodeURIComponent(url.pathname).replace(/\/+$/, "") || "/";
  return `${hostname}${pathname}`;
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
