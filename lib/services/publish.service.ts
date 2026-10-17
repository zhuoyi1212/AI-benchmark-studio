import "server-only";
import { quickExecution, QuickYield } from "@/lib/quick/checkpoints";

import { communityExpressionIssues } from "@/lib/community-experience";
import { AIProviderError, AIValidationError } from "@/lib/ai/errors";
import {
  storyBriefSchema, storyDraftSchema, storyReviewSchema,
  communityPostContentSchema,
  communityPostTitleSchema,
  locatedPublicationAuditSchema,
  communityStyleEditSchema,
  communityPostOutputSchema,
  contentIdeaSchema,
  contentIdeasOutputSchema,
  publishConfigSchema,
  selectedContentIdeaSchema,
  manualPostEditSchema,
  authorPerspectiveSchema,
  type CommunityPostOutput,
  type ContentIdea,
  type PublishConfig,
  type SelectedContentIdea,
} from "@/lib/ai/schemas/publish.schemas";
import { resultAnalysisInputSchema } from "@/lib/ai/schemas/result-analysis.schemas";
import { aiTaskService } from "@/lib/ai/task-service";
import type { AIMessage, AIMessageContent, AIUsage, StructuredTaskResult } from "@/lib/ai/types";
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
import { quickJobsRepository } from "@/lib/repositories/quick-jobs.repository";
import type { QuickJob } from "@/lib/quick/types";

import {
  chooseWritingTemplate, publicationCopyIssues, unsupportedPublicationClaims, publicationReviewPassed, publicationTitleIssues,
  type WritingFact,
} from "@/lib/community-content-policy";

import { communityTitleRules, communityTitleRefreshRules } from "@/lib/community-title-policy";

import { storyPolicyVersion, storyBriefRules, storyWritingRules, storyReviewRules, targetedRevisionRules, storyFinalAuditRules, storyBriefIssues, locatedReviewOutputRules } from "@/lib/community-story-policy";
import { authorPerspectiveRules, hasAuthorPerspective } from '@/lib/author-perspective';

const unsupportedProcessInference = /可能通过隐式代理|倾向于以手动命令|没有自动调用(?:任何)?(?:工具|Agent|Skill)|默认(?:不会|不|仅|只)(?:调用|展示|记录)|官方测评(?:得分|评分)|(?:内置专用\s*)?Skill\s*生态的不足|(?:短板|不足)(?:是|在于)?\s*Agent\/Skill\s*协作透明度|Agent\/Skill\s*协作透明度.{0,12}(?:短板|不足)/i;

export type PublishScreenshot = ReportEvidence & { productName: string; testCaseTitle: string };
type PublishSource = Awaited<ReturnType<typeof getPublishSource>> extends infer Source ? NonNullable<Source> : never;

export type PublishWorkspace = {
  regenerationJob?: Pick<QuickJob, 'status' | 'error_message' | 'stage'> | null;
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
  const packs = await listPacks(source, 1);
  const latest = packs[0] ?? null;
  const links = latest?.status === "ready" ? await publishRepository.listArtifacts(latest.id) : [];
  const ideas = latest ? parseIdeas(latest.content_ideas) : [];
  const selectedIdea = latest?.selected_idea ? selectedContentIdeaSchema.parse(latest.selected_idea) : null;
  const storedConfig = latest && hasKeys(latest.config) ? publishConfigSchema.parse(latest.config) : defaultPublishConfig;
  const config = withAvailableImageCount(withAuthorPerspective(storedConfig, source), source.screenshots.length);
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
    regenerationJob: post?.regeneration && latest?.status !== 'ready'
      ? await quickJobsRepository.get(projectId, post.regeneration.jobId) : null,
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
                authorPerspectiveRules,
                "先确定目标读者最想知道的问题，按实际影响和证据完整性选主线，不因为小问题显眼就把它当标题重点。",
                communityTitleRules,
                "不要机械复述所有 Findings；选题要有一个清晰主线，并保留证据实际覆盖范围。",
                "relatedTestCaseIds 只能引用给定 testCases；relatedArtifactIds 只能引用 imageArtifacts。",
                "UUID 和内部字段标识只能放入对应 ID 数组；严禁复制到 title、type、angle、insight、whyInteresting 或 supportingEvidence 等公开文案。",
                "输出简体中文。",
              ].join("\n")
            : [
                "你是社区内容选题编辑。基于已完成的专业测评发现真正有信息增量的观点，不要把深度报告机械缩短。",
                communityTitleRules,
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
  input: { ideaId: string; customAngle?: string; config: unknown; expectedPackId?: string },
): Promise<string> {
  const source = await getPublishSource(projectId);
  if (!source) throw new PublishExecutionError("请先确认测评 Findings，或完成专业深度报告。");
  const parsedConfig = publishConfigSchema.safeParse(input.config);
  if (!parsedConfig.success) throw new PublishExecutionError('写作配置无效，请检查作者判断的内容和长度后重试。');

  let packs = await listPacks(source);
  if (input.expectedPackId && packs[0]?.id !== input.expectedPackId) throw new PublishExecutionError('文章版本已变化，旧任务已停止。');
  const job = quickExecution.getStore()?.job;
  const regeneration = packs[0]?.community_post && storedPostSchema(packs[0].community_post)?.regeneration;
  if (job && regeneration && regeneration.jobId !== job.id) throw new PublishExecutionError('文章属于其他生成任务，旧任务已停止。');
  if (packs[0]?.status === "ready" || packs[0]?.status === "failed") {
    await beginPack(projectId, source);
    packs = await listPacks(source);
  }
  const pack = packs[0];
  if (job?.kind === 'publish' && pack) await quickJobsRepository.bindPublishPack(job, pack.id);
  const resuming = quickExecution.getStore()?.job.kind === "publish" && pack?.status === "generating";
  if (!pack || (pack.status !== "draft" && !resuming)) throw new PublishExecutionError("请先完成社区选题发现。");

  const ideas = parseIdeas(pack.content_ideas);
  const selectedIdea = selectIdea(ideas, input.ideaId, input.customAngle);
  const imageArtifacts = source.screenshots;
  const config = withAvailableImageCount(withAuthorPerspective(parsedConfig.data, source), imageArtifacts.length);
  const postInput = buildPostInput(source, selectedIdea, config);
  const inputSignature = createInputSignature(postInput);
  if (resuming && JSON.stringify(pack.config) !== JSON.stringify(config)) {
    // Compare structurally below; DB JSON key ordering is not stable.
    if (createInputSignature(pack.config) !== createInputSignature(config)) throw new PublishExecutionError('写作配置已变化，请重新生成。');
  }
  const confirmedFindings = source.kind === "findings" ? source.confirmedFindings.findings : [];
  const facts = postInput.factLedger;
  let stage = "读取写作材料";
  try {
    // Scope raw evidence to this immutable source, not every current project run.
    const rawEvidence = await buildRawFindingsEvidenceContent(projectId, {
      preferPdfText: true,
      testCaseIds: [...new Set(facts.map(f => f.testCaseId))],
      artifactIds: source.artifactIds,
    });
    if (Array.isArray(rawEvidence) && rawEvidence.some(part => part.type === "video_url")) {
      throw new PublishExecutionError("视频必须先提取 MediaEvidence，不能直接交给文章模型。");
    }
    const requiresVision = Array.isArray(rawEvidence) && rawEvidence.some(item => item.type === "image_url" || item.type === "file_url");
    const factCheck = requiresVision ? aiTaskService.factCheckCommunityPost : aiTaskService.factCheckTextCommunityPost;
    const originalDetails = typeof rawEvidence === "string" ? rawEvidence : rawEvidence.filter(item => item.type === "text").map(item => item.text).join("\n");
    stage = "确定文章主线";
    const briefMessages = publicationMessages(storyBriefRules, postInput, rawEvidence);
    const briefResult = await (requiresVision ? factCheck : aiTaskService.discoverContentIdeas)({
      schema: storyBriefSchema.superRefine((brief, context) => {
        for (const message of storyBriefIssues(brief, facts, postInput.template)) context.addIssue({ code: "custom", message });
      }),
      schemaName: "CommunityStoryBrief", messages: briefMessages, maxTokens: 5_000, maxAttempts: 2,
    });
    const storyBrief = briefResult.data;
    const claimFacts = [...facts, { id: 'raw-details', productId: '', testCaseId: '', observation: originalDetails, interpretation: '', evidenceArtifactIds: [] }];
    const writingSource = { ...postInput, storyBrief, originalDetails };
    stage = "撰写初稿";
    const draftMessages: AIMessage[] = [
      { role: "system", content: storyWritingRules },
      { role: "user", content: JSON.stringify(writingSource) },
    ];
    const draftResult = await aiTaskService.generateCommunityPost({
      schema: storyDraftSchema, schemaName: "CommunityPostDraft", messages: draftMessages,
      maxTokens: 6_000, maxAttempts: 2,
      beforeExecute: route => resuming ? Promise.resolve() : publishRepository.startPost(pack.id, selectedIdea, config, route, inputSignature),
    });
    const original = pickCopy(draftResult.data);
    stage = "核验初稿";
    const reviewMessages = publicationMessages(storyReviewRules, { source: postInput, storyBrief, draft: original }, rawEvidence);
    const reviewedResult = await factCheck({
      schema: storyReviewSchema.superRefine((review, context) => {
        for (const issue of review.issues) {
          if (issue.quote && !original[issue.field].includes(issue.quote)) context.addIssue({ code: "custom", message: "问题定位必须引用初稿原文" });
        }
        if (!publicationReviewPassed(review.articleReview) && !review.issues.length) context.addIssue({ code: "custom", message: "审核不通过时必须说明需修订的问题" });
      }),
      schemaName: "CommunityPostReview", messages: reviewMessages, maxTokens: 3_000, maxAttempts: 2,
      validationRepairInstruction: locatedReviewOutputRules + "\nReturn articleReview and issues at the root. Root issues MUST be objects with field, quote, kind, reason, instruction; NEVER strings. Only articleReview.issues contains strings. Close and escape every JSON string correctly.",
    });
    // Deterministic copy gates also become targeted issues rather than blanket rewriting.
    const copyIssues = [...publicationCopyIssues(original), ...publicationTitleIssues(original.title, original.body), ...unsupportedPublicationClaims(original, claimFacts, postInput.scopeNotes), ...communityExpressionIssues({ ...draftResult.data, screenshotRecommendations: [] }, config, confirmedFindings)];
    if (!source.products.some(p => original.title.includes(p.name))) copyIssues.push("标题需要写清产品名");
    if (unsupportedProcessInference.test(original.body)) copyIssues.push("不能从缺少过程记录推断产品行为");
    const needsRevision = reviewedResult.data.issues.length > 0 || !publicationReviewPassed(reviewedResult.data.articleReview) || copyIssues.length > 0;
    const revisionReview = { ...reviewedResult.data, deterministicIssues: copyIssues };
    let finalCopy = original;
    const generationTrace = [trace("planning", briefResult, briefMessages), trace("writing", draftResult, draftMessages), trace("content_check", reviewedResult, reviewMessages)];
    const usages = [briefResult.usage, draftResult.usage, reviewedResult.usage];
    if (needsRevision) {
      stage = "修订已发现的问题";
      const revisionMessages: AIMessage[] = [
        { role: "system", content: targetedRevisionRules + "\n同样解决 review.deterministicIssues 列出的格式与表达问题。" },
        { role: "user", content: JSON.stringify({ ...writingSource, review: revisionReview, draft: original }) },
      ];
      const revisionSchema = communityStyleEditSchema.superRefine((copy, context) => {
        const remaining = [...publicationCopyIssues(copy), ...unsupportedPublicationClaims(copy, claimFacts, postInput.scopeNotes),
          ...communityExpressionIssues({ ...draftResult.data, ...copy, screenshotRecommendations: [] }, config, confirmedFindings)];
        if (!source.products.some(p => copy.title.includes(p.name))) remaining.push('标题需要写清产品名');
        if (unsupportedProcessInference.test(copy.body)) remaining.push('不能从缺少过程记录推断产品行为');
        for (const message of remaining) context.addIssue({ code: 'custom', message });
      });
      const revisionResult = await aiTaskService.humanizeCommunityPost({ schema: revisionSchema, schemaName: "CommunityPostRevision", messages: revisionMessages, maxTokens: 6_000, maxAttempts: 2,
        validationRepairInstruction: 'Resolve every reported validation issue in the returned copy. Remove unsupported claims rather than replacing them with synonyms. Keep the title within 28 Unicode characters. Preserve unaffected evidence and return title, body, interactionQuestion only.' });
      finalCopy = revisionResult.data;
      if (JSON.stringify(finalCopy) === JSON.stringify(original)) throw new PublishExecutionError("已发现的问题未被实际修订，请重试。");
      generationTrace.push(trace("style_edit", revisionResult, revisionMessages));
      usages.push(revisionResult.usage);
    }
    stage = "最终保真检查";
    const auditMessages = publicationMessages(storyFinalAuditRules, { source: postInput, storyBrief, review: revisionReview, originalDraft: original, draft: finalCopy }, rawEvidence);
    const checkedResult = await factCheck({ schema: locatedPublicationAuditSchema(finalCopy), schemaName: "EvidenceCheckedCommunityPost", messages: auditMessages, maxTokens: 3_000, maxAttempts: 2,
      validationRepairInstruction: locatedReviewOutputRules + '\nAudit only draft, the final copy. Every blocking reason in articleReview.issues or stylePreservation.issues must have a matching issues entry with the identical reason and an exact quote from draft[field]. Never quote storyBrief, originalDraft or review as final copy. Return empty issue arrays when there is no unresolved problem. Do not approve an actual error to satisfy the schema.' });
    const preservation = checkedResult.data.stylePreservation;
    if (!publicationReviewPassed(checkedResult.data.articleReview) || preservation.issues.length ||
      !preservation.facts || !preservation.scope || !preservation.stance || !preservation.experience || !preservation.advice || !preservation.evidence) {
      const reasons = [...new Set([...checkedResult.data.articleReview.issues, ...preservation.issues])];
      throw new PublishExecutionError(`最终稿未通过：${reasons.slice(0, 2).join('；')}。本次文章未发布。`);
    }
    generationTrace.push(trace("fact_check", checkedResult, auditMessages));
    usages.push(checkedResult.usage);
    const changed = JSON.stringify(original) !== JSON.stringify(finalCopy);
    const screenshotRecommendations = normalizeScreenshotRecommendations(checkedResult.data.screenshotRecommendations, finalCopy.body, postInput.imageArtifacts.map(a => a.artifactId), config.imageCount);
    const post = communityPostOutputSchema.parse({
      ...draftResult.data, ...finalCopy, storyBrief, draftReview: reviewedResult.data, screenshotRecommendations,
      articleReview: checkedResult.data.articleReview, stylePreservation: preservation,
      styleEdit: { original, edited: finalCopy, changed },
      contentPolicyVersion: storyPolicyVersion,
      factCheck: { status: changed ? "revised" : "passed", revisedClaimCount: reviewedResult.data.issues.filter(i => i.kind === "fact").length, notes: reviewedResult.data.issues.map(i => i.reason) },
      languagePass: { status: changed ? "polished" : "unchanged", notes: [changed ? "按审核问题定向修订，最终稿已独立复核" : "初稿通过审核，未进行无条件润色，最终稿已独立复核"] },
      generationTrace,
    });
    const issues = [...publicationCopyIssues(post), ...publicationTitleIssues(post.title, post.body), ...unsupportedPublicationClaims(post, claimFacts, postInput.scopeNotes), ...communityExpressionIssues(post, config, confirmedFindings)];
    if (!source.products.some(p => post.title.includes(p.name))) issues.push("标题需要写清产品名");
    if (unsupportedProcessInference.test(post.body)) issues.push("不能从缺少过程记录推断产品行为");
    if (issues.length) throw new PublishExecutionError(`最终内容规范未通过：${issues[0]}。请重试。`);
    assertPost(post, postInput.imageArtifacts.map(a => a.artifactId), config.imageCount);
    stage = "保存文章";
    await publishRepository.complete(pack.id, post, combineUsage(...usages));
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
    products: workspace.products.map(p => p.name),
    avoidTitles: [pack.post.title],
    articleBody: pack.post.body,
    requirements: {
      length: "6-28 个 Unicode 字符",
      clear: true,
      summarizeReview: true,
      summarizeConcreteContent: true,
      avoidVagueQuestions: true,
      includeTestPurpose: true,
      prioritizeMainResult: true,
      preserveArticleMeaning: true,
      avoidClickbait: true,
      mustDifferFromCurrentTitle: true,
    },
  };
  const messages: AIMessage[] = [
    {
      role: "system",
      content: communityTitleRefreshRules,
    },
    { role: "user", content: JSON.stringify(titleInput) },
  ];
  const inputSignature = createInputSignature(messages);

  try {
    const schema = communityPostTitleSchema.superRefine((value, context) => {
      for (const issue of publicationTitleIssues(value.title, pack.post!.body, pack.post!.title)) {
        context.addIssue({ code: "custom", path: ["title"], message: issue });
      }
      if (!workspace.products.some(product => value.title.includes(product.name))) {
        context.addIssue({ code: "custom", path: ["title"], message: "标题需要写清产品名" });
      }
    });
    const generated = await aiTaskService.generateCommunityPostTitle({
      schema,
      schemaName: "CommunityPostTitle",
      messages,
      maxTokens: 600,
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

export async function saveCommunityPostEdit(projectId: string, sourcePackId: string, input: unknown): Promise<string> {
  const workspace = await getPublishWorkspace(projectId);
  const pack = workspace?.pack;
  if (!workspace || !pack?.post || pack.id !== sourcePackId || pack.status !== 'ready') {
    throw new PublishExecutionError('文章版本已变化，请刷新页面后再保存。');
  }
  const parsed = manualPostEditSchema.safeParse(input);
  if (!parsed.success) throw new PublishExecutionError('请填写标题、正文和标签；内容过长或配图格式无效。');
  const { imageIds, ...copy } = parsed.data;
  const allowed = new Set(workspace.screenshots.map(s => s.artifactId));
  if (new Set(imageIds).size !== imageIds.length || imageIds.some(id => !allowed.has(id))) {
    throw new PublishExecutionError('配图必须是当前测评的真实截图，且不能重复。');
  }
  const recommendations = imageIds.map((artifactId, index) => {
    const original = pack.post!.screenshotRecommendations.find(s => s.artifactId === artifactId);
    const supportsClaim = original?.supportsClaim && copy.body.includes(original.supportsClaim) ? original.supportsClaim : null;
    const paragraphIndex = supportsClaim ? copy.body.split(/\n\s*\n/).findIndex(p => p.includes(supportsClaim)) : -1;
    return { artifactId, order: index + 1, reason: '人工选择的原始测试截图', supportsClaim,
      supportsParagraph: paragraphIndex >= 0 ? paragraphIndex + 1 : null };
  });
  if (!communityPostOutputSchema.safeParse({ ...pack.post, ...copy, screenshotRecommendations: recommendations }).success) {
    throw new PublishExecutionError('文章格式无效，请移除内部标识或检查内容长度后再保存。');
  }
  try {
    return await publishRepository.createRevision(projectId, pack.id, 'manual', copy as unknown as Json, recommendations as unknown as Json);
  } catch {
    throw new PublishExecutionError('保存未完成，文章可能已有新版本，请刷新核对后重试。你的输入仍保留在编辑器中。');
  }
}

export async function enqueueCommunityPostRegeneration(projectId: string, sourcePackId: string, authorPerspective?: unknown): Promise<string> {
  const workspace = await getPublishWorkspace(projectId);
  const pack = workspace?.pack;
  if (!pack?.post || pack.id !== sourcePackId || (pack.status !== 'ready' && workspace?.regenerationJob?.status !== 'failed')) {
    throw new PublishExecutionError('文章版本已变化或仍在生成，请刷新页面后重试。');
  }
  const parsed = authorPerspective === undefined ? undefined : authorPerspectiveSchema.safeParse(authorPerspective);
  if (parsed && !parsed.success) throw new PublishExecutionError('请检查作者判断，每项最多600字。');
  const copy = parsed?.success ? { authorPerspective: parsed.data } : {};
  try { return await (parsed
    ? publishRepository.createRevision(projectId, pack.id, 'regenerate', copy as Json)
    : publishRepository.createRevision(projectId, pack.id, 'regenerate')); }
  catch { throw new PublishExecutionError('未能启动重新生成，请刷新页面核对任务状态后重试。'); }
}

export async function regeneratePreparedCommunityPost(projectId: string, packId: string): Promise<string> {
  const workspace = await getPublishWorkspace(projectId);
  const pack = workspace?.pack;
  if (!pack || pack.id !== packId) throw new PublishExecutionError('文章或测评来源已变化，重新生成已停止。');
  if (pack.status === 'ready') return pack.id;
  if (!pack.post?.regeneration || !pack.selectedIdea || !['draft', 'generating'].includes(pack.status)) {
    throw new PublishExecutionError('重新生成记录无效，请重试。');
  }
  return generateCommunityPost(projectId, {
    ideaId: pack.selectedIdea.id,
    customAngle: pack.selectedIdea.id === 'custom' ? pack.selectedIdea.angle : undefined,
    config: pack.config,
    expectedPackId: pack.id,
  });
}

function pickCopy(post: { title: string; body: string; interactionQuestion: string }) {
  return { title: post.title, body: post.body, interactionQuestion: post.interactionQuestion };
}

function publicationMessages(rules: string, source: unknown, raw: AIMessageContent): AIMessage[] {
  return [
    { role: "system", content: rules },
    { role: "user", content: JSON.stringify(source) },
    { role: "user", content: raw },
  ];
}

function trace(stage: "evidence_read" | "planning" | "writing" | "content_check" | "style_edit" | "fact_check", result: StructuredTaskResult<unknown>, messages: AIMessage[]) {
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
      artifactIds: quick.artifacts.map(a => a.artifactId),
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
    artifactIds: [...experimentArtifactIds],
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
    const { authorPerspective, ...confirmedFacts } = source.confirmedFindings;
    return {
      sourceType: "confirmed_findings",
      project: { name: source.projectName, intent: source.projectIntent },
      research: source.research,
      protocol: source.protocol,
      testCases: source.testCases,
      humanConfirmedFindings: confirmedFacts,
      ...(hasAuthorPerspective(authorPerspective) ? { authorPerspective } : {}),
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
  const { authorPerspective, ...writingConfig } = config;
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
    contentPolicyVersion: storyPolicyVersion,
    artifactIds: source.artifactIds,
    sourceType: source.kind, projectMode: source.projectMode,
    selectedIdea, config: writingConfig, products: source.products,
    ...(hasAuthorPerspective(authorPerspective) ? { authorPerspective } : {}),
    tasks: source.protocol.testCases.filter(c => coveredCases.has(c.id)),
    factLedger,
    scopeNotes: source.kind === "findings" ? source.confirmedFindings.limitations : source.analysis?.limitations ?? [],
    template: chooseWritingTemplate(factLedger, selectedIdea.relatedTestCaseIds, config),
    humanConfirmedFindings: source.kind === "findings" ? source.confirmedFindings.findings.filter(f => factLedger.some(fact => fact.id === f.id)) : undefined,
    imageArtifacts: source.screenshots.filter(a => coveredCases.has(a.testCaseId)).map(({ fileUrl: _url, ...artifact }) => artifact),
  };
}

function withAuthorPerspective(config: PublishConfig, source: PublishSource): PublishConfig {
  if (config.authorPerspective !== undefined || source.kind !== 'findings') return config;
  const perspective = source.confirmedFindings.authorPerspective;
  return perspective ? { ...config, authorPerspective: perspective } : config;
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

async function listPacks(source: PublishSource, limit?: number) {
  return source.kind === "findings"
    ? publishRepository.listByFindings(source.findingsId, limit)
    : publishRepository.listByReport(source.reportId, limit);
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
  const paragraphs = post.body.split(/\n\s*\n/).filter((paragraph) => paragraph.trim());
  if (refs.length > imageCount
    || new Set(refs.map((item) => item.artifactId)).size !== refs.length
    || refs.some((item) => !allowed.has(item.artifactId))
    || refs.some((item) => item.supportsParagraph == null || !item.supportsClaim)
    || refs.some((item) => !paragraphs[item.supportsParagraph! - 1]?.includes(item.supportsClaim!))
    || refs.some((item, index) => item.order !== index + 1)) {
    throw new AIValidationError("community_post", "orderedRealScreenshotReferences");
  }
}

function normalizeScreenshotRecommendations(
  recommendations: CommunityPostOutput["screenshotRecommendations"],
  body: string,
  artifactIds: string[],
  imageCount: number,
): CommunityPostOutput["screenshotRecommendations"] {
  if (imageCount < 1 || artifactIds.length < 1) return [];

  const allowed = new Set(artifactIds);
  const seen = new Set<string>();
  const paragraphs = body.split(/\n\s*\n/).filter((paragraph) => paragraph.trim());
  return recommendations
    .map(item => ({ ...item, supportsParagraph: item.supportsClaim ? paragraphs.findIndex(p => p.includes(item.supportsClaim!)) + 1 : null }))
    .filter((item) => {
      if (!allowed.has(item.artifactId) || seen.has(item.artifactId)) return false;
      if (item.supportsParagraph == null || !item.supportsClaim) return false;
      if (!paragraphs[item.supportsParagraph - 1]?.includes(item.supportsClaim)) return false;
      seen.add(item.artifactId);
      return true;
    })
    .slice(0, imageCount)
    .map((item, index) => ({ ...item, order: index + 1 }));
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
  if (error instanceof AIValidationError) {
    if (error.schemaName === 'FindingsScreenshotObservations') return error.category === 'invalid_json'
      ? '截图识别返回了无效 JSON，自动修复仍未成功，请重试。'
      : '截图识别结果的条数或字段格式不正确，自动修复仍未成功，请重试。';
    if (error.category === 'schema_validation' && error.schemaName === 'EvidenceCheckedCommunityPost') return '最终审稿意见未能有效定位到最终稿，自动校验修复仍未成功，请重试。';
    if (error.category === 'schema_validation' && error.schemaName === 'CommunityPostReview') return '初审返回的问题列表格式或原文定位不正确，自动修复仍未成功，请重试。';
    if (error.category === 'schema_validation' && error.schemaName === 'CommunityPostRevision') {
      const issue = error.issues.find(item => item.code === 'custom')?.message;
      return issue ? `修订仍未解决：${issue.slice(0, 240)}。请重试。` : '修订稿格式未通过校验，自动修复仍未成功，请重试。';
    }
    return error.category === 'invalid_json'
      ? '社区内容返回了无效 JSON，自动修复仍未成功，请重试。'
      : '社区内容返回的数据未通过结构校验，请重试。';
  }
  if (error instanceof AIProviderError) return providerFailureMessage(error, false);
  if (error instanceof RepositoryError) return "社区发布包保存失败，请刷新后重试。";
  return "社区发布包生成失败，请稍后重试。";
}

function providerFailureMessage(error: AIProviderError, technical: boolean) {
  const provider = error.provider === "zhipu" ? "Z.AI" : error.provider === "deepseek" ? "DeepSeek" : error.provider === "moonshot" ? "Kimi" : error.provider;
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
