import { z } from "zod";

const text = z.string().trim().min(1);
const internalIdentifierPattern = /(?:\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b|\b(?:blindSampleId|TestRun|artifactId|productId|testCaseId|rubricDimensionId|dimensionId|finalScoreSignature|humanOverrideReason)\b)/i;

export const contentIdeaSchema = z.object({
  id: z.string().trim().min(2).max(80).regex(/^[a-z0-9][a-z0-9-]*$/),
  title: text.max(240),
  type: text.max(60),
  angle: text.max(600),
  insight: text.max(1200),
  whyInteresting: text.max(1600),
  supportingEvidence: z.array(text.max(800)).min(1).max(8),
  relatedTestCaseIds: z.array(z.string().uuid()).min(1),
  relatedArtifactIds: z.array(z.string().uuid()).max(9),
  informationValue: z.number().min(0).max(1),
  discussionPotential: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  recommended: z.boolean(),
});

export const contentIdeasOutputSchema = z.object({
  ideas: z.array(contentIdeaSchema).min(1).max(6),
}).superRefine((value, context) => {
  const publicCopy = value.ideas.flatMap((idea) => [
    idea.title,
    idea.type,
    idea.angle,
    idea.insight,
    idea.whyInteresting,
    ...idea.supportingEvidence,
  ]).join("\n");
  if (internalIdentifierPattern.test(publicCopy)) {
    context.addIssue({ code: "custom", message: "Content Idea contains an internal identifier" });
  }
});
export type ContentIdea = z.infer<typeof contentIdeaSchema>;

export const publishConfigSchema = z.object({
  channel: z.enum(["小红书", "站内社区", "知乎", "通用社区"]),
  goal: z.enum(["提供深度洞察", "分享真实体验", "帮助用户选型", "引发讨论", "分享踩坑经历", "提出反常识观点"]),
  stylePreset: z.enum(["真实体验", "克制评测", "专业分析", "深度观察"]).default("真实体验"),
  structure: z.enum(["好用 / 一般 / 难用", "优点 / 问题 / 结论", "自由结构", "场景深度测评", "多维度测评"]).default("好用 / 一般 / 难用"),
  personalRatingEnabled: z.boolean().default(false),
  personalRatingScale: z.union([z.literal(5), z.literal(10)]).default(5),
  tone: text.max(500),
  length: text.max(80),
  imageCount: z.coerce.number().int().min(0).max(9),
  interactionGoal: text.max(500),
});
export type PublishConfig = z.infer<typeof publishConfigSchema>;

export const selectedContentIdeaSchema = z.union([
  contentIdeaSchema,
  z.object({
    id: z.literal("custom"),
    title: text.max(240),
    type: z.literal("自定义"),
    angle: text.max(1200),
    insight: text.max(1200),
    whyInteresting: text.max(1600),
    supportingEvidence: z.array(text.max(800)).min(1).max(8),
    relatedTestCaseIds: z.array(z.string().uuid()).min(1),
    relatedArtifactIds: z.array(z.string().uuid()).max(9),
    informationValue: z.number().min(0).max(1),
    discussionPotential: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    recommended: z.literal(false),
  }),
]);
export type SelectedContentIdea = z.infer<typeof selectedContentIdeaSchema>;

export const screenshotRecommendationSchema = z.object({
  artifactId: z.string().uuid(),
  reason: text.max(800),
  supportsClaim: text.max(800).nullable(),
  supportsParagraph: z.number().int().positive().nullable(),
  order: z.number().int().min(1).max(9),
});

export const editorialSectionSchema = z.object({
  heading: text.max(120),
  findingIds: z.array(text.max(100)).min(1).max(12),
  evidenceArtifactIds: z.array(z.string().uuid()).min(1).max(36),
  observationQuote: text.max(1800),
  readerBenefit: text.max(800),
  boundary: text.max(800),
  advice: z.object({
    kind: z.enum(["tested", "suggestion"]),
    text: text.max(800),
    supportingFindingIds: z.array(text.max(100)).max(12),
  }).nullable(),
});

export const editorialPlanSchema = z.object({
  centralQuestion: text.max(600).optional(),
  targetReader: text.max(400).optional(),
  testScope: text.max(1200).optional(),
  sections: z.array(editorialSectionSchema).min(1).max(8).optional(),
  materialGaps: z.array(text.max(800)).max(8).optional(),
  openingAngle: text.max(1200).optional(),
  closingTakeaway: text.max(1200).optional(),
  personalRating: z.object({
    enabled: z.boolean(),
    score: z.number().min(0).max(10).optional(),
    scale: z.union([z.literal(5), z.literal(10)]).optional(),
    reason: text.max(800).optional(),
    findingIds: z.array(text).min(1).max(12).optional(),
  }).optional(),
  coreConclusion: text.max(1200),
  highlights: z.array(text.max(800)).max(6),
  neutralPoints: z.array(text.max(800)).max(6),
  painPoints: z.array(text.max(800)).max(6),
  structure: z.array(text.max(120)).min(2).max(8),
  avoidClaims: z.array(text.max(800)).max(8),
});

// Required only for new planning calls; historical editorial plans remain readable.
export const communityEditorialPlanSchema = editorialPlanSchema.extend({
  openingAngle: text.max(1200),
  closingTakeaway: text.max(1200),
  centralQuestion: text.max(600),
  targetReader: text.max(400),
  testScope: text.max(1200),
  sections: z.array(editorialSectionSchema).min(1).max(8),
  materialGaps: z.array(text.max(800)).max(8),
});
export type CommunityEditorialPlan = z.infer<typeof communityEditorialPlanSchema>;

export const articleReviewSchema = z.object({
  concreteScenes: z.boolean(),
  boundedInterpretation: z.boolean(),
  nonRepetitive: z.boolean(),
  usefulConclusion: z.boolean(),
  issues: z.array(text.max(800)).max(8),
});

export const publishGenerationTraceSchema = z.array(z.object({
  stage: z.enum(["planning", "writing", "style_edit", "fact_check"]),
  provider: z.enum(["zhipu", "deepseek"]),
  model: text,
  promptVersion: text,
  inputSignature: text,
  usage: z.object({
    inputTokens: z.number().nullable(), outputTokens: z.number().nullable(),
    latencyMs: z.number(), estimatedCost: z.number().nullable(),
  }),
})).max(4);

// Deliberately excludes evidence bindings, ratings, tags and approval metadata.
export const communityStyleEditSchema = z.object({
  title: text.max(240),
  body: text.max(12_000),
  interactionQuestion: z.string().trim().max(600),
}).strict();
export type CommunityStyleEdit = z.infer<typeof communityStyleEditSchema>;

export const stylePreservationSchema = z.object({
  facts: z.boolean(),
  scope: z.boolean(),
  stance: z.boolean(),
  experience: z.boolean(),
  advice: z.boolean(),
  evidence: z.boolean(),
  issues: z.array(text.max(800)).max(8),
});

export const styleEditAuditSchema = z.object({
  original: communityStyleEditSchema,
  edited: communityStyleEditSchema,
  changed: z.boolean(),
});

export const factCheckSchema = z.object({
  status: z.enum(["passed", "revised"]),
  revisedClaimCount: z.number().int().nonnegative().max(50),
  notes: z.array(text.max(800)).max(8),
});

export const communityPostContentSchema = z.object({
  title: text.max(240),
  body: text.max(12_000),
  tags: z.array(text.max(40)).min(1).max(12),
  interactionQuestion: z.string().trim().max(600),
  editorialPlan: editorialPlanSchema.optional(),
  factCheck: factCheckSchema.optional(),
  articleReview: articleReviewSchema.optional(),
  generationTrace: publishGenerationTraceSchema.optional(),
  stylePreservation: stylePreservationSchema.optional(),
  styleEdit: styleEditAuditSchema.optional(),
});

export const communityPostOutputSchema = communityPostContentSchema.extend({
  screenshotRecommendations: z.array(screenshotRecommendationSchema).max(9),
}).superRefine((value, context) => {
  const publicCopy = [value.title, value.body, value.interactionQuestion, ...value.tags].join(" ");
  if (internalIdentifierPattern.test(publicCopy)) {
    context.addIssue({ code: "custom", message: "Community Post contains an internal identifier" });
  }
});
export type CommunityPostOutput = z.infer<typeof communityPostOutputSchema>;

export const communityPostDraftSchema = communityPostOutputSchema.safeExtend({
  editorialPlan: editorialPlanSchema,
});
export type CommunityPostDraft = z.infer<typeof communityPostDraftSchema>;

// Apply completeness and evidence-check metadata to new generations only; historical posts stay readable.
export const communityPostGenerationSchema = communityPostOutputSchema.safeExtend({
  editorialPlan: editorialPlanSchema,
  factCheck: factCheckSchema,
}).refine(
  (post) => post.body.trim().length >= 200 && post.body.split(/\n\s*\n/).filter((paragraph) => paragraph.trim()).length >= 4,
  { path: ["body"], message: "Return the complete article in body, not just an opening: at least 200 characters and 4 paragraphs separated by blank lines. Include the tested task, concrete output, evidence-backed findings, and scope limitations without repeating the same conclusion." },
);
