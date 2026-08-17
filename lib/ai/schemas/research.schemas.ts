import { z } from "zod";

const conciseText = z.string().trim().min(1).max(1000);
const conciseTextList = z.array(z.string().trim().min(1).max(300)).min(1).max(20);

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
