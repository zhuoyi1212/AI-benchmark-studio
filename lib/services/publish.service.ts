import "server-only";
import { quickExecution, QuickYield } from "@/lib/quick/checkpoints";

import { communityExpressionIssues, communityExpressionRules, experienceWritingRules } from "@/lib/community-experience";
import { AIProviderError, AIValidationError } from "@/lib/ai/errors";
import {
  communityPostContentSchema,
  communityPostTitleSchema,
  publicationDraftSchema,
  reviewedPublicationSchema,
  publicationAuditSchema,
  communityStyleEditSchema,
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
import type { AIMessage, AIUsage, StructuredTaskResult } from "@/lib/ai/types";
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

import {
  contentPolicyVersion, contentRules, templateRules, contentReviewRules, polishRules, finalAuditRules,
  chooseWritingTemplate, writingPlanIssues, scopeNotesIssues, unsupportedPublicationClaims, publicationCopyIssues, publicationReviewPassed, publicationStyleIssues, publicationTitleIssues,
  type WritingFact,
} from "@/lib/community-content-policy";

const unsupportedProcessInference = /可能通过隐式代理|倾向于以手动命令|没有自动调用(?:任何)?(?:工具|Agent|Skill)|默认(?:不会|不|仅|只)(?:调用|展示|记录)|官方测评(?:得分|评分)|(?:内置专用\s*)?Skill\s*生态的不足|(?:短板|不足)(?:是|在于)?\s*Agent\/Skill\s*协作透明度|Agent\/Skill\s*协作透明度.{0,12}(?:短板|不足)/i;

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
                "UUID 和内部字段标识只能放入对应 ID 数组；严禁复制到 title、type、angle、insight、whyInteresting 或 supportingEvidence 等公开文案。",
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
    const ideas = normalizeIdeas(result.data.ideas, source);
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
  const resuming = quickExecution.getStore()?.job.kind === "publish" && pack?.status === "generating";
  if (!pack || (pack.status !== "draft" && !resuming)) throw new PublishExecutionError("请先完成社区选题发现。");

  const ideas = parseIdeas(pack.content_ideas);
  const selectedIdea = selectIdea(ideas, input.ideaId, input.customAngle);
  const imageArtifacts = source.screenshots;
  const config = withAvailableImageCount(publishConfigSchema.parse(input.config), imageArtifacts.length);
  const postInput = buildPostInput(source, selectedIdea, config);
  const inputSignature = createInputSignature(postInput);
  if (resuming && JSON.stringify(pack.config) !== JSON.stringify(config)) {
    // Compare structurally below; DB JSON key ordering is not stable.
    if (createInputSignature(pack.config) !== createInputSignature(config)) throw new PublishExecutionError('写作配置已变化，请重新生成。');
  }
  const confirmedFindings = source.kind === "findings" ? source.confirmedFindings.findings : [];
  const facts = postInput.factLedger;
  const template = postInput.template;
  const plannedSchema = publicationDraftSchema.superRefine((post, context) => {
    for (const message of [...writingPlanIssues(post.writingPlan, facts, template), ...scopeNotesIssues(post.writingPlan, postInput.scopeNotes)]) context.addIssue({ code: "custom", message });
  });
  const reviewedSchema = reviewedPublicationSchema.superRefine((post, context) => {
    for (const message of [...writingPlanIssues(post.writingPlan, facts, template), ...scopeNotesIssues(post.writingPlan, postInput.scopeNotes), ...publicationCopyIssues(post), ...unsupportedPublicationClaims(post, facts, postInput.scopeNotes)]) context.addIssue({ code: "custom", message });
    if (unsupportedProcessInference.test(post.body)) context.addIssue({ code: "custom", message: "不能从缺少过程记录推断产品行为" });
  });
  let stage = "撰写初稿";
  try {
    const draftMessages: AIMessage[] = [
      { role: "system", content: [
        "你是中文社区内容策划与初稿编辑。先填 writingPlan 和 contentBrief，再写完整正文；不能只返回提纲。",
        contentRules, templateRules, communityExpressionRules,
        config.stylePreset === "真实体验" ? experienceWritingRules : "保持所选写作风格。",
        "事实判断以 humanConfirmedFindings 为主（若存在）；专业来源只使用 factLedger 的证据观察，不引入排名或数值评分。",
        "有 imageArtifacts 时只引用真实 artifactId；没有图片时必须返回空数组。图片不凑数量。",
        "不得创造体验、数据、竞品对比或未测试能力。一次学校网站失败不能推广到其他网站。",
        "完整返回 title、body、tags、interactionQuestion、contentBrief、writingPlan、screenshotRecommendations。",
      ].join("\n") },
      { role: "user", content: JSON.stringify(postInput) },
    ];
    const draftResult = await aiTaskService.generateCommunityPost({
      schema: plannedSchema, schemaName: "CommunityPostDraft", messages: draftMessages,
      maxTokens: 8_000, maxAttempts: 2,
      beforeExecute: route => resuming ? Promise.resolve() : publishRepository.startPost(pack.id, selectedIdea, config, route, inputSignature),
    });

    // Both Quick and professional articles are checked against raw evidence, not report prose.
    stage = "核验初稿";
    const rawEvidence = await buildRawFindingsEvidenceContent(projectId, { preferPdfText: true });
    const requiresVision = Array.isArray(rawEvidence) && rawEvidence.some(item => item.type === "image_url" || item.type === "file_url");
    const factCheck = requiresVision ? aiTaskService.factCheckCommunityPost : aiTaskService.factCheckTextCommunityPost;
    const reviewMessages: AIMessage[] = [
      { role: "system", content: ["你是内容核验编辑。完整原始 Artifact 优先于摘要和草稿。", contentRules, contentReviewRules,
        "返回完整修订稿，保留 contentBrief、writingPlan 和可验证的材料引用，并附 articleReview 与 factCheck。"].join("\n") },
      { role: "user", content: JSON.stringify({ source: postInput, draft: draftResult.data }) },
      { role: "user", content: rawEvidence },
    ];
    const contentCheckedSchema = reviewedSchema.superRefine((post, context) => {
      if (post.factCheck.status === "revised" && JSON.stringify(pickCopy(post)) === JSON.stringify(pickCopy(draftResult.data))) {
        context.addIssue({ code: "custom", message: "声称已修订但正文未变；请实际修改 title/body/interactionQuestion，而非仅写 notes" });
      }
    });
    const reviewedResult = await factCheck({ schema: contentCheckedSchema, schemaName: "ReviewedCommunityPost", messages: reviewMessages, maxTokens: 8_000, maxAttempts: 2 });
    if (!publicationReviewPassed(reviewedResult.data.articleReview)) throw new PublishExecutionError("初稿的事实或内容质量未通过核验，请检查材料后重试。");
    const original = pickCopy(reviewedResult.data);

    stage = "调整语言";
    const styleSchema = communityStyleEditSchema.superRefine((edited, context) => {
      for (const message of [...publicationStyleIssues(original, edited, reviewedResult.data.writingPlan), ...unsupportedPublicationClaims(edited, facts, postInput.scopeNotes)]) context.addIssue({ code: "custom", message });
    });
    const styleMessages: AIMessage[] = [
      { role: "system", content: [contentRules, polishRules].join("\n") },
      { role: "user", content: JSON.stringify({ config, writingPlan: reviewedResult.data.writingPlan, draft: original }) },
    ];
    const humanizedResult = await aiTaskService.humanizeCommunityPost({ schema: styleSchema, schemaName: "HumanizedCommunityPost", messages: styleMessages, maxTokens: 6_000, maxAttempts: 2 });

    stage = "最终保真检查";
    const auditMessages: AIMessage[] = [
      { role: "system", content: [contentRules, contentReviewRules, finalAuditRules].join("\n") },
      { role: "user", content: JSON.stringify({ source: postInput, writingPlan: reviewedResult.data.writingPlan, originalDraft: original, draft: humanizedResult.data }) },
      { role: "user", content: rawEvidence },
    ];
    const auditSchema = publicationAuditSchema.superRefine((audit, context) => {
      const refs = audit.screenshotRecommendations;
      const paragraphs = humanizedResult.data.body.split(/\n\s*\n/).filter(p => p.trim());
      if (refs.length > config.imageCount || new Set(refs.map(ref => ref.artifactId)).size !== refs.length || refs.some((ref, index) =>
        !postInput.imageArtifacts.some(image => image.artifactId === ref.artifactId) || ref.order !== index + 1 ||
        !ref.supportsParagraph || !ref.supportsClaim || !paragraphs[ref.supportsParagraph - 1]?.includes(ref.supportsClaim))) {
        context.addIssue({ code: "custom", message: "只推荐 imageArtifacts 中能对应最终正文段落和原文的图片；没有可用图片或 imageCount=0 必须返回 []" });
      }
    });
    const checkedResult = await factCheck({ schema: auditSchema, schemaName: "EvidenceCheckedCommunityPost", messages: auditMessages, maxTokens: 2_500, maxAttempts: 2 });
    const preservation = checkedResult.data.stylePreservation;
    if (!publicationReviewPassed(checkedResult.data.articleReview) || preservation.issues.length ||
      !preservation.facts || !preservation.scope || !preservation.stance || !preservation.experience || !preservation.advice || !preservation.evidence) {
      throw new PublishExecutionError("最终稿的事实保真或文章质量检查未通过，请重试；本次文章未发布。");
    }
    const changed = JSON.stringify(original) !== JSON.stringify(humanizedResult.data);
    const post = communityPostOutputSchema.parse({
      ...reviewedResult.data, ...humanizedResult.data,
      screenshotRecommendations: checkedResult.data.screenshotRecommendations,
      articleReview: checkedResult.data.articleReview, stylePreservation: preservation,
      styleEdit: { original, edited: humanizedResult.data, changed },
      contentPolicyVersion,
      languagePass: { status: changed ? "polished" : "unchanged", notes: [changed ? "已完成受约束语言编辑与独立含义检查" : "文案无需修改，已完成独立含义检查"] },
      generationTrace: [
        trace("writing", draftResult, draftMessages), trace("content_check", reviewedResult, reviewMessages),
        trace("style_edit", humanizedResult, styleMessages), trace("fact_check", checkedResult, auditMessages),
      ],
    });
    const issues = [...publicationCopyIssues(post), ...communityExpressionIssues(post, config, confirmedFindings)];
    if (issues.length) throw new PublishExecutionError(`最终内容规范未通过：${issues[0]}。请重试。`);
    assertPost(post, postInput.imageArtifacts.map(artifact => artifact.artifactId), config.imageCount);
    stage = "保存文章";
    await publishRepository.complete(pack.id, post, combineUsage(draftResult.usage, reviewedResult.usage, humanizedResult.usage, checkedResult.usage));
    return pack.id;
  } catch (error) {
    if (error instanceof QuickYield) throw error;
    try { await publishRepository.fail(pack.id, `${stage}：${toUserFacingError(error)}`); } catch { /* preserve source error */ }
    throw new PublishExecutionError(`${stage}：${toUserFacingError(error)}`);
  }
}

export async function refreshCommunityPostTitle(
  projectId: string,
  sourcePackId: string,
): Promise<{ packId: string; title: string }> {
  const workspace = await getPublishWorkspace(projectId);
  const pack = workspace?.pack;
  if (!workspace || !pack || pack.id !== sourcePackId || pack.status !== "ready" || !pack.post) {
    throw new PublishExecutionError("只能为当前最新的已完成文章更换标题，请刷新页面后重试。");
  }

  const titleInput = {
    channel: pack.config.channel,
    currentTitle: pack.post.title,
    articleBody: pack.post.body,
    centralIdea: pack.selectedIdea?.title ?? pack.selectedIdea?.angle ?? "",
    requirements: {
      length: "6-28 个 Unicode 字符",
      clear: true,
      concreteHook: true,
      preserveArticleMeaning: true,
      avoidClickbait: true,
      mustDifferFromCurrentTitle: true,
    },
  };
  const messages: AIMessage[] = [
    {
      role: "system",
      content: [
        "你是中文社区文章标题编辑。只返回一个新标题，不改正文。",
        "标题要让读者立刻知道产品、具体场景或核心发现，并用真实结果、矛盾或使用边界形成钩子。",
        "先清楚，再有吸引力；不使用震惊、必看、封神、天花板等夸张词，不虚构数字、结果或未测试范围。",
        "标题必须与当前标题明显不同，6-28 个字符，输出简体中文。",
      ].join("\n"),
    },
    { role: "user", content: JSON.stringify(titleInput) },
  ];
  const inputSignature = createInputSignature(messages);

  try {
    const schema = communityPostTitleSchema.superRefine((value, context) => {
      for (const issue of publicationTitleIssues(value.title, pack.post!.body, pack.post!.title)) {
        context.addIssue({ code: "custom", path: ["title"], message: issue });
      }
    });
    const generated = await aiTaskService.generateCommunityPostTitle({
      schema,
      schemaName: "CommunityPostTitle",
      messages,
      maxTokens: 300,
      maxAttempts: 2,
    });
    const refreshedAt = new Date().toISOString();
    const newPackId = await publishRepository.refreshTitle(
      pack.id,
      generated.data.title,
      {
        previousTitle: pack.post.title,
        title: generated.data.title,
        provider: generated.route.provider,
        model: generated.route.model,
        promptVersion: generated.route.promptVersion,
        inputSignature,
        refreshedAt,
        usage: generated.usage,
      },
      generated.route,
      inputSignature,
      generated.usage,
    );
    return { packId: newPackId, title: generated.data.title };
  } catch (error) {
    throw new PublishExecutionError(`更换标题失败：${toUserFacingError(error)}`);
  }
}

function pickCopy(post: { title: string; body: string; interactionQuestion: string }) {
  return { title: post.title, body: post.body, interactionQuestion: post.interactionQuestion };
}

function trace(stage: "writing" | "content_check" | "style_edit" | "fact_check", result: StructuredTaskResult<unknown>, messages: AIMessage[]) {
  return { stage, provider: result.route.provider, model: result.route.model, promptVersion: result.route.promptVersion, inputSignature: createInputSignature(messages), usage: result.usage };
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
  if (quick?.evaluationMode === "quick") return null;

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
    judgeEvidence: source.judgeEvidence,
    imageArtifacts,
  };
}

function buildPostInput(source: PublishSource, selectedIdea: SelectedContentIdea, config: PublishConfig) {
  const allFacts: WritingFact[] = source.kind === "findings"
    ? source.confirmedFindings.findings.map(f => ({ id: f.id, productId: f.productId, testCaseId: f.testCaseId, observation: f.observation, interpretation: f.impact, evidenceArtifactIds: f.evidenceArtifactIds }))
    : source.judgeEvidence.flatMap(product => product.scores.map((score, index) => ({
        id: `${product.productId}-${index}`, productId: product.productId, testCaseId: score.testCaseId,
        observation: score.evidence.join("\n"), interpretation: score.humanReviewAdjustment ?? score.reason,
        evidenceArtifactIds: score.evidenceArtifactIds,
      })));
  const factLedger = allFacts.filter(f => f.evidenceArtifactIds.length && (!selectedIdea.relatedTestCaseIds.length || selectedIdea.relatedTestCaseIds.includes(f.testCaseId)));
  if (!factLedger.length) throw new PublishExecutionError("所选角度没有可追溯的实测材料，请重新选择角度。");
  const coveredCases = new Set(factLedger.map(f => f.testCaseId));
  return {
    contentPolicyVersion,
    sourceType: source.kind, projectMode: source.projectMode,
    selectedIdea, config, products: source.products,
    tasks: source.protocol.testCases.filter(c => coveredCases.has(c.id)),
    factLedger,
    scopeNotes: source.kind === "findings" ? source.confirmedFindings.limitations : source.analysis?.limitations ?? [],
    template: chooseWritingTemplate(factLedger, selectedIdea.relatedTestCaseIds, config),
    humanConfirmedFindings: source.kind === "findings" ? source.confirmedFindings.findings.filter(f => factLedger.some(fact => fact.id === f.id)) : undefined,
    imageArtifacts: source.screenshots.filter(a => coveredCases.has(a.testCaseId)).map(({ fileUrl: _url, ...artifact }) => artifact),
  };
}

function buildJudgeEvidence(experiment: ReturnType<typeof resultAnalysisInputSchema.parse>) {
  return experiment.products.map((product) => ({
    productId: product.productId,
    productName: product.productName,
    scores: product.scores.map((score) => ({
      testCaseId: score.testCaseId,
      dimensionId: score.rubricDimensionId,
      reason: score.reason,
      evidence: score.evidence,
      evidenceArtifactIds: product.artifacts.filter(a => a.testCaseId === score.testCaseId).map(a => a.artifactId),
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

function normalizeIdeas(ideas: ContentIdea[], source: PublishSource): ContentIdea[] {
  const caseIds = new Set(source.testCases.map((item) => item.id));
  const artifactIds = new Set(source.screenshots.map((item) => item.artifactId));
  const artifactCaseIds = new Map(source.screenshots.map((item) => [item.artifactId, item.testCaseId] as const));

  const evidenceGroundedIdeas = ideas
    .filter((idea) => !unsupportedProcessInference.test(`${idea.angle}\n${idea.insight}\n${idea.whyInteresting}`))
    .map((idea) => {
      const relatedArtifactIds = idea.relatedArtifactIds.filter((id) => artifactIds.has(id));
      const relatedTestCaseIds = [...new Set([
        ...idea.relatedTestCaseIds.filter((id) => caseIds.has(id)),
        ...relatedArtifactIds.map((id) => artifactCaseIds.get(id)).filter((id): id is string => Boolean(id)),
      ])];
      return { ...idea, relatedArtifactIds, relatedTestCaseIds };
    });

  if (evidenceGroundedIdeas.length < 1) throw new AIValidationError("content_discovery", "atLeastOneEvidenceGroundedIdea");
  const recommendedIndex = evidenceGroundedIdeas.reduce((best, idea, index) => {
    const value = idea.informationValue + idea.discussionPotential + idea.confidence * 0.25;
    const bestIdea = evidenceGroundedIdeas[best]!;
    const bestValue = bestIdea.informationValue + bestIdea.discussionPotential + bestIdea.confidence * 0.25;
    return value > bestValue ? index : best;
  }, 0);

  return evidenceGroundedIdeas.map((idea, index) => ({
    ...idea,
    id: `idea-${index + 1}`,
    recommended: index === recommendedIndex,
  }));
}

function assertPost(post: CommunityPostOutput, artifactIds: string[], imageCount: number) {
  const allowed = new Set(artifactIds);
  const refs = post.screenshotRecommendations;
  if (refs.length > imageCount
    || new Set(refs.map((item) => item.artifactId)).size !== refs.length
    || refs.some((item) => !allowed.has(item.artifactId))
    || refs.some((item) => item.supportsParagraph == null || !item.supportsClaim)
    || refs.some((item, index) => item.order !== index + 1)) {
    throw new AIValidationError("community_post", "orderedRealScreenshotReferences");
  }
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
function combineUsage(...usages: AIUsage[]): AIUsage {
  const sumNullable = (values: Array<number | null>) => {
    const known = values.filter((value): value is number => value !== null);
    return known.length > 0 ? known.reduce((total, value) => total + value, 0) : null;
  };
  return {
    inputTokens: sumNullable(usages.map((usage) => usage.inputTokens)),
    outputTokens: sumNullable(usages.map((usage) => usage.outputTokens)),
    latencyMs: usages.reduce((total, usage) => total + usage.latencyMs, 0),
    estimatedCost: sumNullable(usages.map((usage) => usage.estimatedCost)),
  };
}

function safeFailureMessage(error: unknown) {
  if (error instanceof AIValidationError) return `PublishPack validation failed: ${error.schemaName}`;
  if (error instanceof AIProviderError) return providerFailureMessage(error, true);
  if (error instanceof RepositoryError) return `PublishPack persistence failed at ${error.operation}`;
  if (error instanceof PublishExecutionError) return error.message;
  return "PublishPack generation failed";
}

function toUserFacingError(error: unknown) {
  if (error instanceof PublishExecutionError) return error.message;
  if (error instanceof AIValidationError) return "社区内容返回的数据未通过结构校验，请重试。";
  if (error instanceof AIProviderError) return providerFailureMessage(error, false);
  if (error instanceof RepositoryError) return "社区发布包保存失败，请刷新后重试。";
  return "社区发布包生成失败，请稍后重试。";
}

function providerFailureMessage(error: AIProviderError, technical: boolean) {
  const provider = error.provider === "zhipu" ? "Z.AI" : error.provider === "deepseek" ? "DeepSeek" : error.provider;
  const status = error.status ? ` HTTP ${error.status}` : "";
  const detail = error.providerMessage ? `：${error.providerMessage}` : "";
  if (technical) return `${provider} ${error.task} failed (${error.category}${status})${detail}`;

  switch (error.category) {
    case "authentication":
      return `${provider} 鉴权失败${status}，请检查对应 API Key。`;
    case "payment_required":
      return `${provider} 账户余额或模型权限不足${status}。`;
    case "rate_limit":
      return `${provider} 当前请求过多${status}，已重试仍失败，请稍后再试。`;
    case "timeout":
      return `${provider} 生成社区内容超时，请重试。`;
    case "network":
      return `${provider} 网络请求失败，请检查网络或 API 服务状态后重试。`;
    case "provider_5xx":
      return `${provider} 服务端异常${status}，已重试仍失败，请稍后再试。`;
    case "bad_request":
      return `${provider} 拒绝了本次生成请求${status}${detail}`;
    default:
      return `${provider} 暂时无法完成社区内容${status}${detail}`;
  }
}
