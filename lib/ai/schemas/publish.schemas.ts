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

export const communityPostContentSchema = z.object({
  title: text.max(240),
  body: text.max(12_000),
  tags: z.array(text.max(40)).min(1).max(12),
  interactionQuestion: text.max(600),
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

// Apply completeness to new generations only; historical posts stay readable.
export const communityPostGenerationSchema = communityPostOutputSchema.refine(
  (post) => post.body.trim().length >= 200 && post.body.split(/\n\s*\n/).filter((paragraph) => paragraph.trim()).length >= 4,
  { path: ["body"], message: "Return the complete article in body, not just an opening: at least 200 characters and 4 paragraphs separated by blank lines. Include the tested task, concrete output, evidence-backed findings, and scope limitations without repeating the same conclusion." },
);
