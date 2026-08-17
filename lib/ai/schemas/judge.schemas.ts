import { z } from "zod";

const oneDecimalScoreSchema = z.number().min(0).max(10).refine(
  (score) => Number.isInteger(score * 10),
  "aiScore must use at most one decimal place",
);

export const judgeCaseOutputSchema = z.object({
  scores: z.array(z.object({
    blindSampleId: z.string().uuid(),
    rubricDimensionId: z.string().uuid(),
    aiScore: oneDecimalScoreSchema,
    reason: z.string().trim().min(1).max(4000),
    evidence: z.array(z.string().trim().min(1).max(1200)).min(1).max(12),
    confidence: z.number().min(0).max(1),
  })).min(1).max(120),
});

export type JudgeCaseOutput = z.infer<typeof judgeCaseOutputSchema>;
export type JudgeCaseScoreOutput = JudgeCaseOutput["scores"][number];
