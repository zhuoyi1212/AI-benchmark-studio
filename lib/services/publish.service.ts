import "server-only";

import { AIProviderError, AIValidationError } from "@/lib/ai/errors";
import {
  communityPostContentSchema,
  communityPostDraftSchema,
  communityPostGenerationSchema,
  communityPostOutputSchema,
  contentIdeaSchema,
  contentIdeasOutputSchema,
  publishConfigSchema,
  selectedContentIdeaSchema,
  type CommunityPostOutput,
  type ContentIdea,
  type PublishConfig,
  type SelectedContentIdea,
} from "@/lib/ai/schemas/publish.schemas";
import { resultAnalysisInputSchema } from "@/lib/ai/schemas/result-analysis.schemas";
import { aiTaskService } from "@/lib/ai/task-service";
import type { AIMessage } from "@/lib/ai/types";
import { publishRepository } from "@/lib/repositories/publish.repository";
import { defaultPublishConfig } from "@/lib/publish-config";
import { RepositoryError } from "@/lib/repositories/repository-error";
import { resultAnalysisRepository } from "@/lib/repositories/result-analysis.repository";
import { getProjectMode, type ProjectMode } from "@/lib/project-mode";
import { createInputSignature } from "@/lib/signatures";
import { buildRawFindingsEvidenceContent, getExperienceFindingsWorkspace } from "@/lib/services/findings.service";
import { getReportWorkspace, type ReportEvidence } from "@/lib/services/report.service";
import { getResearchWorkspace } from "@/lib/services/research.service";
import type { Json, PublishPackRow } from "@/lib/types/database";

const unsupportedProcessInference = /可能通过隐式代理|倾向于以手动命令|没有自动调用(?:任何)?(?:工具|Agent|Skill)|默认(?:不会|不|仅|只)(?:调用|展示|记录)|官方测评(?:得分|评分)|(?:内置专用\s*)?Skill\s*生态的不足|(?:短板|不足)(?:是|在于)?\s*Agent\/Skill\s*协作透明度|Agent\/Skill\s*协作透明度.{0,12}(?:短板|不足)/i;
const evidenceGroundedPostSchema = communityPostGenerationSchema.refine(
  (post) => !unsupportedProcessInference.test(post.body),
  "Missing process evidence must not be converted into claims about product behavior.",
);

export type PublishScreenshot = ReportEvidence & { productName: string; testCaseTitle: string };
type PublishSource = Awaited<ReturnType<typeof getPublishSource>> extends infer Source ? NonNullable<Source> : never;

export type PublishWorkspace = {
  projectId: string;
  projectName: string;
  projectMode: ProjectMode;
  sourceType: "findings" | "report";
  reportId: string | null;
  findingsId: string | null;
  products: Array<{ id: string; name: string }>;
  testCases: Array<{ id: string; title: string }>;
  screenshots: PublishScreenshot[];
  pack: {
    id: string;
    version: number;
    status: PublishPackRow["status"];
    errorMessage: string | null;
    ideas: ContentIdea[];
    selectedIdea: SelectedContentIdea | null;
    config: PublishConfig;
    post: CommunityPostOutput | null;
    completedAt: string | null;
  } | null;
};

export class PublishExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishExecutionError";
  }
}

export async function getPublishWorkspace(projectId: string): Promise<PublishWorkspace | null> {
  const source = await getPublishSource(projectId);
  if (!source) return null;
  const packs = await listPacks(source);
  const latest = packs[0] ?? null;
  const links = latest?.status === "ready" ? await publishRepository.listArtifacts(latest.id) : [];
  const ideas = latest ? parseIdeas(latest.content_ideas) : [];
  const selectedIdea = latest?.selected_idea ? selectedContentIdeaSchema.parse(latest.selected_idea) : null;
  const storedConfig = latest && hasKeys(latest.config) ? publishConfigSchema.parse(latest.config) : defaultPublishConfig;
  const config = withAvailableImageCount(storedConfig, source.screenshots.length);
  const storedPost = latest?.community_post ? storedPostSchema(latest.community_post) : null;
  const post = storedPost ? communityPostOutputSchema.parse({
    ...storedPost,
    screenshotRecommendations: links.map((link) => ({
      artifactId: link.artifact_id,
      reason: link.reason,
      supportsClaim: link.supports_claim,
      supportsParagraph: link.supports_paragraph,
      order: link.display_order,
    })),
  }) : null;

  return {
    projectId,
    projectName: source.projectName,
    projectMode: source.projectMode,
    sourceType: source.kind,
    reportId: source.reportId,
    findingsId: source.findingsId,
    products: source.products,
    testCases: source.testCases,
    screenshots: source.screenshots,
    pack: latest ? {
      id: latest.id,
      version: latest.version,
      status: latest.status,
      errorMessage: latest.error_message,
      ideas,
      selectedIdea,
      config,
      post,
      completedAt: latest.completed_at,
    } : null,
  };
}

export async function discoverContentIdeas(projectId: string): Promise<string> {
  const source = await getPublishSource(projectId);
  if (!source) throw new PublishExecutionError("请先确认测评 Findings；专业模式也可以通过完成深度报告进入社区内容。");
  let packId: string | null = null;
  try {
    packId = await beginPack(projectId, source);
    const input = buildDiscoveryInput(source);
    const inputSignature = createInputSignature(input);
    const result = await aiTaskService.discoverContentIdeas({
      schema: contentIdeasOutputSchema,
      schemaName: "ContentIdeas",
      messages: [
        {
          role: "system",
          content: source.kind === "findings"
            ? [
                "你是社区内容策划编辑。选题只能建立在人工确认后的真实 Findings、测试计划、Research 背景和真实截图证据上。",
                "不要重新评分，不要生成排名，也不要把专业评分当作选题中心。",
                "优先寻找：最好用的功能、体验一般但有价值的功能、最影响使用的问题、意外发现和明确适用边界。",
                "不要机械复述所有 Findings；选题要有一个清晰主线，并保留证据实际覆盖范围。",
                "relatedTestCaseIds 只能引用给定 testCases；relatedArtifactIds 只能引用 imageArtifacts。",
                "输出简体中文。",
              ].join("\n")
            : [
                "你是社区内容选题编辑。基于已完成的专业测评发现真正有信息增量的观点，不要把深度报告机械缩短。",
                "评分仅作为背景，优先使用真实 Case、Judge Evidence、人工复核与 Artifact 支撑具体观点。",
                "不得创造实验数据；缺少过程日志不能推断产品默认行为或能力不足。",
                "relatedArtifactIds 只能引用 imageArtifacts。输出简体中文。",
              ].join("\n"),
        },
        { role: "user", content: JSON.stringify(input) },
      ],
      maxTokens: 8_000,
      maxAttempts: 2,
      beforeExecute: (route) => publishRepository.startDiscovery(packId!, route, inputSignature),
    });
    const ideas = normalizeIdeas(result.data.ideas);
    assertIdeas(ideas, source);
    await publishRepository.completeDiscovery(packId, ideas, result.usage);
    return packId;
  } catch (error) {
    if (packId) {
      try { await publishRepository.fail(packId, safeFailureMessage(error)); } catch { /* preserve source error */ }
    }
    throw new PublishExecutionError(toUserFacingError(error));
  }
}

export async function generateCommunityPost(
  projectId: string,
  input: { ideaId: string; customAngle?: string; config: unknown },
): Promise<string> {
  const source = await getPublishSource(projectId);
  if (!source) throw new PublishExecutionError("请先确认测评 Findings，或完成专业深度报告。");

  let packs = await listPacks(source);
  if (packs[0]?.status === "ready" || packs[0]?.status === "failed") {
    await beginPack(projectId, source);
    packs = await listPacks(source);
  }
  const pack = packs[0];
  if (!pack || pack.status !== "draft") throw new PublishExecutionError("请先完成社区选题发现。");

  const ideas = parseIdeas(pack.content_ideas);
  const selectedIdea = selectIdea(ideas, input.ideaId, input.customAngle);
  const imageArtifacts = source.screenshots;
  const config = withAvailableImageCount(publishConfigSchema.parse(input.config), imageArtifacts.length);
  const postInput = buildPostInput(source, selectedIdea, config);
  const inputSignature = createInputSignature(postInput);

  try {
    const draftResult = await aiTaskService.generateCommunityPost({
      schema: communityPostDraftSchema,
      schemaName: "CommunityPostDraft",
      messages: [
        {
          role: "system",
          content: [
            "你是中文社区测评内容编辑。先做内容策划，再写完整草稿。",
            "社区内容的中心是实际测到了什么、哪些功能好用、哪些一般、哪些难用，以及这些现象对使用者意味着什么。",
            source.kind === "findings"
              ? "事实判断以 humanConfirmedFindings 为主；Research 只提供背景。不得引入评分、Judge 或 Report 中不存在于本次快速链路的信息。"
              : "事实判断以真实 Case、Artifact、Judge Evidence 和 Human Review 为主；Final Score 只可作为辅助背景。",
            "editorialPlan 必须先明确 coreConclusion、highlights、neutralPoints、painPoints、文章结构和禁止扩大的结论。",
            "如果 config.stylePreset=真实体验：使用第一人称、短句、直接判断，可以写“我这次测试”“我的感受是”，但只能描述本项目真实留存的测试；不能虚构未发生的操作。",
            "如果 config.structure=好用 / 一般 / 难用：正文优先按“先给结论 → 好用的功能 → 体验一般的功能 → 不能用/用着难受的功能 → 个人感受”组织；没有真实发现的类别就省略。",
            "标题朴素直接，不做营销式悬念。每个功能段先说判断，再说具体测试现象和影响。",
            "避免媒体稿和 AI 总结腔，不要使用“总体而言、值得注意的是、从这个角度来看、这一表现说明”等空泛连接词。",
            "不要为了显得严谨反复写免责声明。范围限制只在必要位置简短说明一次。",
            "不得创造体验、数据、竞品对比或未测试能力。证据不完整时必须收缩说法。",
            "有 imageArtifacts 时 screenshotRecommendations 只能引用其中 artifactId；没有图片时必须返回空数组。",
            "输出简体中文完整正文，不能只返回提纲。",
          ].join("\n"),
        },
        { role: "user", content: JSON.stringify(postInput) },
      ],
      maxTokens: 8_000,
      maxAttempts: 2,
      beforeExecute: (route) => publishRepository.startPost(pack.id, selectedIdea, config, route, inputSignature),
    });

    const factCheckInput = {
      source: postInput,
      draft: draftResult.data,
      factCheckRules: [
        "逐条检查标题和正文中的事实性描述是否能被输入证据直接支持。",
        "将过度概括改成证据实际覆盖的范围。例如只测试一个学校网站失败，不能写成所有非主流平台失败率高。",
        "同一论文出现多个编号本身不能证明引用混乱；抽查一条引用不能扩大为全部来源真实或全部来源有误。",
        "缺少过程日志只能写本次未留存，不能推断产品没有调用工具或能力不足。",
        "评分不是社区文章主线，不要为了保留分数而牺牲真实使用发现。",
        "保留自然社区语言，不要把核对后的文章改回报告体。",
      ],
    };

    const factCheckMessages: AIMessage[] = [
      {
        role: "system",
        content: [
          "你是最终事实核对编辑。请基于 source 对 draft 做逐句事实核验。",
          source.kind === "findings" ? "Quick 模式还会再次提供完整原始 Artifact；当人工 Findings、草稿与原始 Artifact 冲突时，以原始 Artifact 可观察事实为准，并收缩结论。" : "专业模式以当前可用的 Case、Judge Evidence、Human Review 和 Report 证据边界为准。",
          "如果某个表述超出证据范围，直接在最终正文中改成更窄、更准确的说法；不要只在 notes 里提醒。",
          "保留 draft 的社区表达、第一人称语气和结构，不要重写成学术报告。",
          "editorialPlan 必须保留并可按核对结果微调。",
          "factCheck.status 若正文发生任何事实范围修订则为 revised，否则为 passed；revisedClaimCount 记录被收缩或修正的事实性表述数量。",
          "不得新增 source 中不存在的事实。最终 body 必须是可直接发布的完整文章。",
        ].join("\n"),
      },
      { role: "user", content: JSON.stringify(factCheckInput) },
    ];
    if (source.kind === "findings") {
      factCheckMessages.push({ role: "user" as const, content: await buildRawFindingsEvidenceContent(projectId) });
    }

    const checkedResult = await aiTaskService.factCheckCommunityPost({
      schema: evidenceGroundedPostSchema,
      schemaName: "EvidenceCheckedCommunityPost",
      messages: factCheckMessages,
      maxTokens: 8_000,
      maxAttempts: 2,
    });

    const post = normalizeScreenshotRecommendations(checkedResult.data, selectedIdea, imageArtifacts, config.imageCount);
    assertPost(post, imageArtifacts.map((artifact) => artifact.artifactId), config.imageCount);
    await publishRepository.complete(pack.id, post, checkedResult.usage);
    return pack.id;
  } catch (error) {
    try { await publishRepository.fail(pack.id, safeFailureMessage(error)); } catch { /* preserve source error */ }
    throw new PublishExecutionError(toUserFacingError(error));
  }
}

async function getPublishSource(projectId: string) {
  const quick = await getExperienceFindingsWorkspace(projectId);
  if (quick?.latest?.status === "completed" && quick.latest.humanConfirmedAt && quick.latest.effectiveOutput) {
    const research = await getResearchWorkspace(projectId);
    if (!research?.completedResult) return null;
    const screenshots: PublishScreenshot[] = quick.artifacts
      .filter((artifact) => artifact.mimeType.startsWith("image/"))
      .map((artifact) => ({
        artifactId: artifact.artifactId,
        productId: artifact.productId,
        testCaseId: artifact.testCaseId,
        fileName: artifact.fileName,
        mimeType: artifact.mimeType,
        fileUrl: artifact.fileUrl,
        caption: artifact.caption,
        productName: artifact.productName,
        testCaseTitle: artifact.testCaseTitle,
      }));
    return {
      kind: "findings" as const,
      sourceId: quick.latest.id,
      findingsId: quick.latest.id,
      reportId: null,
      projectName: quick.projectName,
      projectIntent: quick.projectIntent,
      projectMode: quick.projectMode,
      products: quick.products,
      testCases: quick.testCases.map((item) => ({ id: item.id, title: item.title })),
      protocol: {
        id: quick.protocolId,
        version: quick.protocolVersion,
        testCases: quick.testCases,
      },
      research: research.completedResult,
      confirmedFindings: quick.latest.effectiveOutput,
      screenshots,
    };
  }

  const report = await getReportWorkspace(projectId);
  if (!report?.report || report.report.status !== "completed" || !report.report.content) return null;
  const analysisRow = await resultAnalysisRepository.getById(report.resultAnalysisId);
  if (!analysisRow?.input_snapshot) return null;
  const experiment = resultAnalysisInputSchema.parse(analysisRow.input_snapshot);
  const experimentArtifactIds = new Set(experiment.products.flatMap((product) => product.artifacts.map((artifact) => artifact.artifactId)));
  const screenshots: PublishScreenshot[] = report.evidence
    .filter((artifact) => artifact.mimeType.startsWith("image/") && experimentArtifactIds.has(artifact.artifactId))
    .map((artifact) => ({
      ...artifact,
      productName: report.ranking.find((product) => product.productId === artifact.productId)?.productName ?? "测试产品",
      testCaseTitle: report.protocol.testCases.find((testCase) => testCase.id === artifact.testCaseId)?.title ?? "Test Case",
    }));

  return {
    kind: "report" as const,
    sourceId: report.report.id,
    findingsId: null,
    reportId: report.report.id,
    projectName: report.projectName,
    projectIntent: report.projectIntent,
    projectMode: getProjectMode(experiment.products),
    products: report.ranking.map((product) => ({ id: product.productId, name: product.productName })),
    testCases: report.protocol.testCases.map((item) => ({ id: item.id, title: item.title })),
    protocol: report.protocol,
    research: report.research,
    reportContent: report.report.content,
    ranking: report.ranking,
    analysis: report.analysis,
    caseScores: report.caseScores,
    humanReview: report.review,
    judgeEvidence: buildJudgeEvidence(experiment),
    screenshots,
  };
}

function buildDiscoveryInput(source: PublishSource) {
  const imageArtifacts = source.screenshots.map(({ artifactId, productId, testCaseId, fileName, caption }) => ({
    artifactId,
    productId,
    testCaseId,
    fileName,
    caption,
  }));
  if (source.kind === "findings") {
    return {
      sourceType: "confirmed_findings",
      project: { name: source.projectName, intent: source.projectIntent },
      research: source.research,
      protocol: source.protocol,
      testCases: source.testCases,
      humanConfirmedFindings: source.confirmedFindings,
      imageArtifacts,
    };
  }
  return {
    sourceType: "professional_report",
    project: { name: source.projectName, intent: source.projectIntent },
    research: source.research,
    protocol: source.protocol,
    ranking: source.ranking,
    caseScores: source.caseScores,
    finalAnalysis: source.analysis,
    report: source.reportContent,
    judgeEvidence: source.judgeEvidence,
    imageArtifacts,
  };
}

function buildPostInput(source: PublishSource, selectedIdea: SelectedContentIdea, config: PublishConfig) {
  const common = {
    sourceType: source.kind,
    projectMode: source.projectMode,
    selectedIdea,
    config,
    research: source.research,
    protocol: source.protocol,
    imageArtifacts: source.screenshots,
  };
  if (source.kind === "findings") {
    return { ...common, humanConfirmedFindings: source.confirmedFindings };
  }
  return {
    ...common,
    report: source.reportContent,
    ranking: source.ranking,
    analysis: source.analysis,
    caseScores: source.caseScores,
    humanReview: source.humanReview,
    judgeEvidence: source.judgeEvidence,
  };
}

function buildJudgeEvidence(experiment: ReturnType<typeof resultAnalysisInputSchema.parse>) {
  return experiment.products.map((product) => ({
    productId: product.productId,
    productName: product.productName,
    scores: product.scores.map((score) => ({
      testCaseId: score.testCaseId,
      dimensionId: score.rubricDimensionId,
      finalScore: score.finalScore,
      reason: score.reason,
      evidence: score.evidence,
      humanReviewAdjustment: score.humanOverrideReason,
    })),
  }));
}

async function beginPack(projectId: string, source: PublishSource) {
  return source.kind === "findings"
    ? publishRepository.beginFromFindings(projectId, source.findingsId)
    : publishRepository.beginFromReport(projectId, source.reportId);
}

async function listPacks(source: PublishSource) {
  return source.kind === "findings"
    ? publishRepository.listByFindings(source.findingsId)
    : publishRepository.listByReport(source.reportId);
}

function assertIdeas(ideas: ContentIdea[], source: PublishSource) {
  const caseIds = new Set(source.testCases.map((item) => item.id));
  const artifactIds = new Set(source.screenshots.map((item) => item.artifactId));
  if (new Set(ideas.map((idea) => idea.id)).size !== ideas.length || ideas.filter((idea) => idea.recommended).length !== 1) {
    throw new AIValidationError("content_discovery", "uniqueIdeasAndSingleRecommendation");
  }
  for (const idea of ideas) {
    if (idea.relatedTestCaseIds.some((id) => !caseIds.has(id)) || idea.relatedArtifactIds.some((id) => !artifactIds.has(id))) {
      throw new AIValidationError("content_discovery", "realEvidenceReferences");
    }
  }
}

function normalizeIdeas(ideas: ContentIdea[]): ContentIdea[] {
  const evidenceGroundedIdeas = ideas.filter((idea) => !unsupportedProcessInference.test(`${idea.angle}\n${idea.insight}\n${idea.whyInteresting}`));
  if (evidenceGroundedIdeas.length < 2) throw new AIValidationError("content_discovery", "atLeastTwoEvidenceGroundedIdeas");
  const recommendedIndex = evidenceGroundedIdeas.reduce((best, idea, index) => {
    const value = idea.informationValue + idea.discussionPotential + idea.confidence * 0.25;
    const bestIdea = evidenceGroundedIdeas[best]!;
    const bestValue = bestIdea.informationValue + bestIdea.discussionPotential + bestIdea.confidence * 0.25;
    return value > bestValue ? index : best;
  }, 0);
  return evidenceGroundedIdeas.map((idea, index) => ({ ...idea, id: `idea-${index + 1}`, recommended: index === recommendedIndex }));
}

function assertPost(post: CommunityPostOutput, artifactIds: string[], imageCount: number) {
  const allowed = new Set(artifactIds);
  const refs = post.screenshotRecommendations;
  if (post.body.trim().length < 200 || post.body.split(/\n\s*\n/).filter((paragraph) => paragraph.trim()).length < 4) {
    throw new AIValidationError("community_post", "publishableEvidenceArticleStructure");
  }
  if (refs.length > imageCount
    || new Set(refs.map((item) => item.artifactId)).size !== refs.length
    || refs.some((item) => !allowed.has(item.artifactId))
    || refs.some((item, index) => item.order !== index + 1)) {
    throw new AIValidationError("community_post", "orderedRealScreenshotReferences");
  }
}

function normalizeScreenshotRecommendations(
  post: CommunityPostOutput,
  idea: SelectedContentIdea,
  artifacts: ReportEvidence[],
  imageCount: number,
): CommunityPostOutput {
  const allowed = new Set(artifacts.map((artifact) => artifact.artifactId));
  const seen = new Set<string>();
  const valid = post.screenshotRecommendations.filter((item) => allowed.has(item.artifactId) && !seen.has(item.artifactId) && seen.add(item.artifactId));
  const preferredIds = [
    ...idea.relatedArtifactIds,
    ...artifacts.filter((artifact) => idea.relatedTestCaseIds.includes(artifact.testCaseId)).map((artifact) => artifact.artifactId),
    ...artifacts.map((artifact) => artifact.artifactId),
  ];
  for (const artifactId of preferredIds) {
    if (valid.length >= imageCount || seen.has(artifactId) || !allowed.has(artifactId)) continue;
    seen.add(artifactId);
    valid.push({
      artifactId,
      reason: `支持“${idea.title}”这一观点的原始测试截图。`,
      supportsClaim: idea.insight,
      supportsParagraph: null,
      order: valid.length + 1,
    });
  }
  return { ...post, screenshotRecommendations: valid.slice(0, imageCount).map((item, index) => ({ ...item, order: index + 1 })) };
}

function withAvailableImageCount(config: PublishConfig, availableImageCount: number): PublishConfig {
  return { ...config, imageCount: Math.min(config.imageCount, availableImageCount) };
}

function selectIdea(ideas: ContentIdea[], ideaId: string, customAngle?: string): SelectedContentIdea {
  if (ideaId !== "custom") {
    const idea = ideas.find((item) => item.id === ideaId);
    if (!idea) throw new PublishExecutionError("所选社区角度不存在。");
    return idea;
  }
  const angle = customAngle?.trim();
  if (!angle) throw new PublishExecutionError("请输入自定义内容角度。");
  const basis = ideas.find((item) => item.recommended) ?? ideas[0];
  if (!basis) throw new PublishExecutionError("请先完成社区选题发现。");
  return selectedContentIdeaSchema.parse({
    ...basis,
    id: "custom",
    title: angle.slice(0, 240),
    type: "自定义",
    angle,
    insight: angle,
    recommended: false,
  });
}

function parseIdeas(value: Json): ContentIdea[] {
  return Array.isArray(value) ? value.map((idea) => contentIdeaSchema.parse(idea)) : [];
}
function storedPostSchema(value: Json) {
  return communityPostContentSchema.parse(value);
}
function hasKeys(value: Json) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0);
}
function safeFailureMessage(error: unknown) {
  if (error instanceof AIValidationError) return `PublishPack validation failed: ${error.schemaName}`;
  if (error instanceof AIProviderError) return "AI Provider request failed";
  if (error instanceof RepositoryError) return `PublishPack persistence failed at ${error.operation}`;
  if (error instanceof PublishExecutionError) return error.message;
  return "PublishPack generation failed";
}
function toUserFacingError(error: unknown) {
  if (error instanceof PublishExecutionError) return error.message;
  if (error instanceof AIValidationError) return "社区内容返回的数据未通过结构校验，请重试。";
  if (error instanceof AIProviderError) return "AI Provider 暂时无法完成社区内容，请稍后重试。";
  if (error instanceof RepositoryError) return "社区发布包保存失败，请刷新后重试。";
  return "社区发布包生成失败，请稍后重试。";
}
