import "server-only";

import { AIProviderError, AIValidationError } from "@/lib/ai/errors";
import {
  communityPostContentSchema,
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
        { role: "system", content: source.projectMode === "single" ? "你是社区内容选题编辑。基于一次真实的单产品体验发现有信息增量、反直觉或讨论价值的观点，重点关注官方定位与实测差异、真实场景表现、明显优点与限制；不要写成横向比较或排名，也不要把报告机械缩短。只使用输入中的 Final Score、Case、Judge Evidence、人工复核、Research 与真实 Artifact metadata；不得创造事实。relatedArtifactIds 只能引用 imageArtifacts。输出简体中文。" : "你是社区内容选题编辑。基于完整实验结构发现真正有信息增量、反直觉或讨论价值的观点，不要把深度报告机械缩短。只使用输入中的 Final Score、分析、Case、Judge Evidence、人工复核、Research 与真实 Artifact metadata；不得创造事实。选题数量、类型、标题与角度必须动态。relatedArtifactIds 只能引用输入中的 imageArtifacts。用户可见文案不得输出 UUID、数据库字段名、Schema 字段名或内部 ID。输出简体中文。" },
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
    const result = await aiTaskService.generateCommunityPost({
      schema: communityPostOutputSchema,
      schemaName: "CommunityPost",
      messages: [
        { role: "system", content: source.projectMode === "single" ? "你是中文社区内容编辑。围绕用户选定观点写一篇‘我真实体验了这个 AI 产品之后发现……’的独立帖子。事实必须来自 Research、Protocol、Judge Evidence、Human Review、Report 与真实 Artifact；不要大段复述官网，也不要写成报告摘要、排名或虚构竞品比较。正文至少 4 段，依次形成 Hook、体验动机与方法、具体 Case 证据和关键发现、问题或意外、适合/不适合人群、个人判断与真实讨论问题。有 imageArtifacts 时可选择真实截图，artifactId 只能从中选择；没有图片时 screenshotRecommendations 必须返回空数组，正文仍需引用 Judge Evidence 和 Report 中的可核查发现。不得创造体验或数据。" : "你是中文社区内容编辑。围绕用户选定观点写一篇可独立成立、有证据、有判断、有讨论空间的帖子。事实必须来自 Research、Protocol、Judge Evidence、Human Review、Report 与真实 Artifact；不要大段复述官网，也不要写成报告摘要或夸张营销文案。正文至少 4 段，覆盖 Hook、测试动机与方法、具体 Case 证据、关键差异或意外、用户意义、个人判断与真实讨论问题。有 imageArtifacts 时，artifactId 只能从中选择，并且同一 Case 的多产品对比应连续排列；没有图片时 screenshotRecommendations 必须返回空数组。不得创造实验数据；用户可见文案不得输出 UUID、数据库字段名、Schema 字段名或内部 ID。" },
        { role: "user", content: JSON.stringify(postInput) },
      ],
      maxTokens: 8_000,
      maxAttempts: 2,
      beforeExecute: (route) => publishRepository.startPost(pack.id, selectedIdea, config, route, inputSignature),
    });
    const post = normalizeScreenshotRecommendations(result.data, selectedIdea, imageArtifacts, config.imageCount);
    assertPost(post, imageArtifacts.map((artifact) => artifact.artifactId), config.imageCount);
    await publishRepository.complete(pack.id, post, result.usage);
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
  const recommendedIndex = ideas.reduce((best, idea, index) => {
    const value = idea.informationValue + idea.discussionPotential + idea.confidence * 0.25;
    const bestIdea = ideas[best]!;
    const bestValue = bestIdea.informationValue + bestIdea.discussionPotential + bestIdea.confidence * 0.25;
    return value > bestValue ? index : best;
  }, 0);
  return ideas.map((idea, index) => ({ ...idea, id: `idea-${index + 1}`, recommended: index === recommendedIndex }));
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
