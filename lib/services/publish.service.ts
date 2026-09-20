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
import { publishRepository } from "@/lib/repositories/publish.repository";
import { defaultPublishConfig } from "@/lib/publish-config";
import { RepositoryError } from "@/lib/repositories/repository-error";
import { resultAnalysisRepository } from "@/lib/repositories/result-analysis.repository";
import { getProjectMode, type ProjectMode } from "@/lib/project-mode";
import { createInputSignature } from "@/lib/signatures";
import { getReportWorkspace, type ReportEvidence } from "@/lib/services/report.service";
import type { Json, PublishPackRow } from "@/lib/types/database";

const unsupportedProcessInference = /可能通过隐式代理|倾向于以手动命令|没有自动调用(?:任何)?(?:工具|Agent|Skill)|默认(?:不会|不|仅|只)(?:调用|展示|记录)|官方测评(?:得分|评分)|(?:内置专用\s*)?Skill\s*生态的不足|(?:短板|不足)(?:是|在于)?\s*Agent\/Skill\s*协作透明度|Agent\/Skill\s*协作透明度.{0,12}(?:短板|不足)/i;
const evidenceGroundedPostSchema = communityPostGenerationSchema.refine(
  (post) => !unsupportedProcessInference.test(post.body),
  "Missing process evidence must not be converted into claims about product behavior.",
);

export type PublishScreenshot = ReportEvidence & { productName: string; testCaseTitle: string };
export type PublishWorkspace = {
  projectId: string;
  projectName: string;
  projectMode: ProjectMode;
  reportId: string;
  products: Array<{ id: string; name: string }>;
  testCases: Array<{ id: string; title: string }>;
  screenshots: PublishScreenshot[];
  pack: {
    id: string; version: number; status: PublishPackRow["status"]; errorMessage: string | null;
    ideas: ContentIdea[]; selectedIdea: SelectedContentIdea | null; config: PublishConfig;
    post: CommunityPostOutput | null; completedAt: string | null;
  } | null;
};

export class PublishExecutionError extends Error {
  constructor(message: string) { super(message); this.name = "PublishExecutionError"; }
}

export async function getPublishWorkspace(projectId: string): Promise<PublishWorkspace | null> {
  const source = await getPublishSource(projectId);
  if (!source) return null;
  const packs = await publishRepository.listByReport(source.report.report!.id);
  const latest = packs[0] ?? null;
  const links = latest?.status === "ready" ? await publishRepository.listArtifacts(latest.id) : [];
  const screenshots = source.screenshots.map((item) => ({
    ...item,
    productName: source.report.ranking.find((product) => product.productId === item.productId)?.productName ?? "测试产品",
    testCaseTitle: source.report.protocol.testCases.find((testCase) => testCase.id === item.testCaseId)?.title ?? "Test Case",
  }));
  const ideas = latest ? parseIdeas(latest.content_ideas) : [];
  const selectedIdea = latest?.selected_idea ? selectedContentIdeaSchema.parse(latest.selected_idea) : null;
  const storedConfig = latest && hasKeys(latest.config) ? publishConfigSchema.parse(latest.config) : defaultPublishConfig;
  const config = withAvailableImageCount(storedConfig, source.screenshots.length);
  const storedPost = latest?.community_post ? storedPostSchema(latest.community_post) : null;
  const post = storedPost ? communityPostOutputSchema.parse({
    ...storedPost,
    screenshotRecommendations: links.map((link) => ({
      artifactId: link.artifact_id, reason: link.reason, supportsClaim: link.supports_claim,
      supportsParagraph: link.supports_paragraph, order: link.display_order,
    })),
  }) : null;
  return {
    projectId, projectName: source.report.projectName, projectMode: source.projectMode, reportId: source.report.report!.id,
    products: source.report.ranking.map((product) => ({ id: product.productId, name: product.productName })),
    testCases: source.report.protocol.testCases.map((testCase) => ({ id: testCase.id, title: testCase.title })),
    screenshots,
    pack: latest ? { id: latest.id, version: latest.version, status: latest.status, errorMessage: latest.error_message, ideas, selectedIdea, config, post, completedAt: latest.completed_at } : null,
  };
}

export async function discoverContentIdeas(projectId: string): Promise<string> {
  const source = await getPublishSource(projectId);
  if (!source) throw new PublishExecutionError("请先生成当前有效的深度报告。");
  let packId: string | null = null;
  try {
    packId = await publishRepository.begin(projectId, source.report.report!.id);
    const input = buildDiscoveryInput(source);
    const inputSignature = createInputSignature(input);
    const result = await aiTaskService.discoverContentIdeas({
      schema: contentIdeasOutputSchema,
      schemaName: "ContentIdeas",
      messages: [
        { role: "system", content: source.projectMode === "single" ? "你是社区内容选题编辑。基于一次真实的单产品体验发现有信息增量、反直觉或讨论价值的观点，重点关注官方定位与实测差异、真实场景表现、明显优点与限制；不要写成横向比较或排名，也不要把报告机械缩短。只使用输入中的 Final Score、Case、Judge Evidence、人工复核、Research 与真实 Artifact metadata；不得创造事实。若 analysis 或 limitations 已指出某个总分、维度分受到 TestCase 与全局 Rubric 不适配等测评设计因素影响，不得把该分数直接包装成产品短板，优先把“实际 Case 表现与汇总分差异”作为方法学发现。缺少工具调用或执行日志只能表述为‘本次证据未提供’，不得据此推断产品未调用工具、默认行为或能力不足。没有可验证逐字来源时，不得把 Research 定位改写成带引号的官方宣传语；二手来源中的价格或套餐不得作为选题事实。relatedArtifactIds 只能引用 imageArtifacts。输出简体中文。" : "你是社区内容选题编辑。基于完整实验结构发现真正有信息增量、反直觉或讨论价值的观点，不要把深度报告机械缩短。只使用输入中的 Final Score、分析、Case、Judge Evidence、人工复核、Research 与真实 Artifact metadata；不得创造事实。若 analysis 或 limitations 已指出某个分数受到 TestCase 与 Rubric 不适配等测评设计因素影响，不得把该分数直接包装成产品差异。缺少工具调用或执行日志只能表述为本次证据未提供，不得推断默认行为或能力不足。选题数量、类型、标题与角度必须动态。relatedArtifactIds 只能引用输入中的 imageArtifacts。用户可见文案不得输出 UUID、数据库字段名、Schema 字段名或内部 ID。输出简体中文。" },
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
    if (packId) { try { await publishRepository.fail(packId, safeFailureMessage(error)); } catch { /* preserve source error */ } }
    throw new PublishExecutionError(toUserFacingError(error));
  }
}

export async function generateCommunityPost(projectId: string, input: { ideaId: string; customAngle?: string; config: unknown }): Promise<string> {
  const source = await getPublishSource(projectId);
  if (!source) throw new PublishExecutionError("请先生成当前有效的深度报告。");
  let packs = await publishRepository.listByReport(source.report.report!.id);
  if (packs[0]?.status === "ready" || packs[0]?.status === "failed") {
    await publishRepository.begin(projectId, source.report.report!.id);
    packs = await publishRepository.listByReport(source.report.report!.id);
  }
  const pack = packs[0];
  if (!pack || pack.status !== "draft") throw new PublishExecutionError("请先完成社区选题发现。");

  const ideas = parseIdeas(pack.content_ideas);
  const selectedIdea = selectIdea(ideas, input.ideaId, input.customAngle);
  const imageArtifacts = source.screenshots;
  const config = withAvailableImageCount(publishConfigSchema.parse(input.config), imageArtifacts.length);
  const postInput = {
    projectMode: source.projectMode,
    selectedIdea,
    config,
    research: source.report.research,
    report: source.report.report!.content,
    ranking: source.report.ranking,
    analysis: source.report.analysis,
    protocol: source.report.protocol,
    caseScores: source.report.caseScores,
    humanReview: source.report.review,
    judgeEvidence: buildJudgeEvidence(source),
    imageArtifacts,
  };
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
            "社区内容的中心是用户实际测到了什么、哪些功能好用、哪些一般、哪些难用，以及这些现象对使用者意味着什么。不要围绕综合分展开；Final Score 仅可作为辅助背景，除非用户选题明确要求讨论评分。",
            "editorialPlan 必须先明确 coreConclusion、highlights、neutralPoints、painPoints、文章结构和禁止扩大的结论。",
            "如果 config.stylePreset=真实体验：使用第一人称、短句、直接判断，可以写“我这次测试”“我的感受是”，但只能描述本项目真实留存的测试；不能虚构未发生的操作。",
            "如果 config.structure=好用 / 一般 / 难用：正文优先按“先给结论 → 好用的功能 → 体验一般的功能 → 不能用/用着难受的功能 → 个人感受”组织；某一类没有真实发现就省略，不要硬凑。",
            "标题朴素直接，不做营销式悬念。每个功能段先说判断，再说具体测试现象和影响。",
            "语言避免媒体稿和 AI 总结腔，不要使用“总体而言、值得注意的是、从这个角度来看、这一表现说明”等空泛连接词。",
            "不要为了显得严谨反复写免责声明。范围限制只在必要位置简短说明一次。",
            "Research 只提供背景；产品能力结论以真实 Test、Artifact、Judge Evidence 和 Human Review 中可观察证据为准。",
            "不得创造体验、数据、竞品对比或未测试能力。没有完整证据时使用收缩后的说法。",
            "有 imageArtifacts 时 screenshotRecommendations 只能引用其中 artifactId；没有图片时返回空数组。",
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

    const checkedResult = await aiTaskService.generateCommunityPost({
      schema: evidenceGroundedPostSchema,
      schemaName: "EvidenceCheckedCommunityPost",
      messages: [
        {
          role: "system",
          content: [
            "你是最终事实核对编辑。请基于 source 对 draft 做逐句事实核验。",
            "如果某个表述超出证据范围，直接在最终正文中改成更窄、更准确的说法；不要只在 notes 里提醒。",
            "保留 draft 的社区表达、第一人称语气和结构，不要重写成学术报告。",
            "editorialPlan 必须保留并可按核对结果微调。",
            "factCheck.status 若正文发生任何事实范围修订则为 revised，否则为 passed；revisedClaimCount 记录被收缩或修正的事实性表述数量；notes 只记录最重要的修订原因。",
            "不得新增 source 中不存在的事实。最终 body 必须是可直接发布的完整文章。",
          ].join("\n"),
        },
        { role: "user", content: JSON.stringify(factCheckInput) },
      ],
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
  const report = await getReportWorkspace(projectId);
  if (!report?.report || report.report.status !== "completed" || !report.report.content) return null;
  const analysisRow = await resultAnalysisRepository.getById(report.resultAnalysisId);
  if (!analysisRow?.input_snapshot) return null;
  const experiment = resultAnalysisInputSchema.parse(analysisRow.input_snapshot);
  const experimentArtifactIds = new Set(experiment.products.flatMap((product) => product.artifacts.map((artifact) => artifact.artifactId)));
  const screenshots = report.evidence.filter((artifact) => artifact.mimeType.startsWith("image/") && experimentArtifactIds.has(artifact.artifactId));
  return { report, experiment, screenshots, projectMode: getProjectMode(experiment.products) };
}

function buildDiscoveryInput(source: NonNullable<Awaited<ReturnType<typeof getPublishSource>>>) {
  return { projectMode: source.projectMode, project: { name: source.report.projectName, intent: source.report.projectIntent }, research: source.report.research, protocol: source.report.protocol, ranking: source.report.ranking, caseScores: source.report.caseScores, finalAnalysis: source.report.analysis, report: source.report.report!.content, judgeEvidence: buildJudgeEvidence(source), imageArtifacts: source.screenshots.map(({ artifactId, productId, testCaseId, fileName, caption }) => ({ artifactId, productId, testCaseId, fileName, caption })) };
}

function buildJudgeEvidence(source: NonNullable<Awaited<ReturnType<typeof getPublishSource>>>) {
  return source.experiment.products.map((product) => ({
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

function assertIdeas(ideas: ContentIdea[], source: NonNullable<Awaited<ReturnType<typeof getPublishSource>>>) {
  const caseIds = new Set(source.report.protocol.testCases.map((item) => item.id));
  const artifactIds = new Set(source.screenshots.map((item) => item.artifactId));
  if (new Set(ideas.map((idea) => idea.id)).size !== ideas.length || ideas.filter((idea) => idea.recommended).length !== 1) throw new AIValidationError("content_discovery", "uniqueIdeasAndSingleRecommendation");
  for (const idea of ideas) if (idea.relatedTestCaseIds.some((id) => !caseIds.has(id)) || idea.relatedArtifactIds.some((id) => !artifactIds.has(id))) throw new AIValidationError("content_discovery", "realEvidenceReferences");
}

function normalizeIdeas(ideas: ContentIdea[]): ContentIdea[] {
  const evidenceGroundedIdeas = ideas.filter((idea) => !unsupportedProcessInference.test(`${idea.angle}\n${idea.insight}\n${idea.whyInteresting}`));
  if (evidenceGroundedIdeas.length < 3) throw new AIValidationError("content_discovery", "atLeastThreeEvidenceGroundedIdeas");
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
  if (refs.length > imageCount || new Set(refs.map((item) => item.artifactId)).size !== refs.length || refs.some((item) => !allowed.has(item.artifactId)) || refs.some((item, index) => item.order !== index + 1)) throw new AIValidationError("community_post", "orderedRealScreenshotReferences");
}

function normalizeScreenshotRecommendations(post: CommunityPostOutput, idea: SelectedContentIdea, artifacts: ReportEvidence[], imageCount: number): CommunityPostOutput {
  const allowed = new Set(artifacts.map((artifact) => artifact.artifactId));
  const seen = new Set<string>();
  const valid = post.screenshotRecommendations.filter((item) => allowed.has(item.artifactId) && !seen.has(item.artifactId) && seen.add(item.artifactId));
  const preferredIds = [...idea.relatedArtifactIds, ...artifacts.filter((artifact) => idea.relatedTestCaseIds.includes(artifact.testCaseId)).map((artifact) => artifact.artifactId), ...artifacts.map((artifact) => artifact.artifactId)];
  for (const artifactId of preferredIds) {
    if (valid.length >= imageCount || seen.has(artifactId) || !allowed.has(artifactId)) continue;
    seen.add(artifactId);
    valid.push({ artifactId, reason: `支持“${idea.title}”这一观点的原始测试截图。`, supportsClaim: idea.insight, supportsParagraph: null, order: valid.length + 1 });
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
  return selectedContentIdeaSchema.parse({ ...basis, id: "custom", title: angle.slice(0, 240), type: "自定义", angle, insight: angle, recommended: false });
}

function parseIdeas(value: Json): ContentIdea[] { return Array.isArray(value) ? value.map((idea) => contentIdeaSchema.parse(idea)) : []; }
function storedPostSchema(value: Json) { return communityPostContentSchema.parse(value); }
function hasKeys(value: Json) { return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0); }
function safeFailureMessage(error: unknown) { if (error instanceof AIValidationError) return `PublishPack validation failed: ${error.schemaName}`; if (error instanceof AIProviderError) return "AI Provider request failed"; if (error instanceof RepositoryError) return `PublishPack persistence failed at ${error.operation}`; if (error instanceof PublishExecutionError) return error.message; return "PublishPack generation failed"; }
function toUserFacingError(error: unknown) { if (error instanceof PublishExecutionError) return error.message; if (error instanceof AIValidationError) return "社区内容返回的数据未通过结构校验，请重试。"; if (error instanceof AIProviderError) return "AI Provider 暂时无法完成社区内容，请稍后重试。"; if (error instanceof RepositoryError) return "社区发布包保存失败，请刷新后重试。"; return "社区发布包生成失败，请稍后重试。"; }
