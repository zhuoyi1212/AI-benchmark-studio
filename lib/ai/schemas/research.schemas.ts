import { z } from "zod";

const conciseText = z.string().trim().min(1).max(1000);
const conciseTextList = z.array(z.string().trim().min(1).max(300)).min(1).max(20);

const unresolvedResearchPattern = /(?:无法|不能|未能|未找到|没有).*?(?:确定|确认|提供|检索|找到|信息)|cannot (?:determine|confirm|find)/i;

export const productResearchSynthesisSchema = z.object({
  positioning: conciseText,
  targetUsers: conciseTextList,
  capabilities: conciseTextList,
  keyFeatures: conciseTextList,
  pricing: z.object({
    summary: conciseText,
    freePlan: z.string().trim().max(500).nullable(),
    paidFrom: z.string().trim().max(200).nullable(),
    currency: z.string().trim().max(30).nullable(),
  }).nullable(),
  officialBestPractices: z.array(z.string().trim().min(1).max(500)).max(20),
  limitations: z.array(z.string().trim().min(1).max(500)).max(20),
  sourceUrls: z.array(z.string().url()).min(1).max(30),
}).superRefine((research, context) => {
  if (unresolvedResearchPattern.test(research.positioning)) {
    context.addIssue({ code: "custom", path: ["positioning"], message: "Positioning must contain traceable product facts, not an unresolved placeholder" });
  }
  for (const field of ["targetUsers", "capabilities", "keyFeatures"] as const) {
    if (research[field].every((item) => unresolvedResearchPattern.test(item))) {
      context.addIssue({ code: "custom", path: [field], message: `${field} must contain at least one traceable product fact` });
    }
  }
});

export const comparabilityResultSchema = z.object({
  status: z.enum(["comparable", "partially_comparable", "not_comparable"]),
  score: z.number().min(0).max(1).optional(),
  reason: z.string().trim().min(1).max(2000),
  commonCapabilities: z.array(z.string().trim().min(1).max(300)).max(30),
  warnings: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
});

export type ProductResearchSynthesis = z.infer<typeof productResearchSynthesisSchema>;
export type ValidatedComparabilityResult = z.infer<typeof comparabilityResultSchema>;
