import { z } from "zod";

const textList = z.array(z.string().trim().min(1)).min(1).max(6);

export const resultAnalysisInputSchema = z.object({
  project: z.object({ id: z.string().uuid(), name: z.string().min(1), intent: z.string().min(1) }),
  review: z.object({
    reviewSessionId: z.string().uuid(),
    judgeRunId: z.string().uuid(),
    finalScoreSignature: z.string().regex(/^[0-9a-f]{64}$/),
    adjustmentCount: z.number().int().nonnegative(),
  }),
  protocol: z.object({
    id: z.string().uuid(),
    version: z.number().int().positive(),
    title: z.string().min(1),
    goal: z.string().min(1),
    testMode: z.string().min(1),
    rules: z.array(z.unknown()),
    testCases: z.array(z.object({
      id: z.string().uuid(),
      position: z.number().int().positive(),
      title: z.string().min(1),
      objective: z.string().min(1),
      prompt: z.string().min(1),
      observationFocus: z.array(z.unknown()),
    })).min(1),
    rubric: z.array(z.object({
      id: z.string().uuid(),
      position: z.number().int().positive(),
      name: z.string().min(1),
      weight: z.coerce.number().positive(),
      description: z.string().nullable(),
      scoringStandard: z.record(z.string(), z.unknown()),
    })).min(1),
  }),
  products: z.array(z.object({
    productId: z.string().uuid(),
    productName: z.string().min(1),
    sampleId: z.string().uuid(),
    scores: z.array(z.object({
      judgeScoreId: z.string().uuid(),
      testCaseId: z.string().uuid(),
      rubricDimensionId: z.string().uuid(),
      aiScore: z.coerce.number().min(0).max(10),
      finalScore: z.coerce.number().min(0).max(10),
      reason: z.string().min(1),
      evidence: z.array(z.string().min(1)).min(1),
      confidence: z.coerce.number().min(0).max(1),
      humanOverrideReason: z.string().nullable(),
    })).min(1),
    artifacts: z.array(z.object({
      artifactId: z.string().uuid(),
      testCaseId: z.string().uuid(),
      kind: z.string().min(1),
      mimeType: z.string().min(1),
      fileName: z.string().min(1),
      sizeBytes: z.number().nonnegative(),
      sha256: z.string().nullable(),
      generationTimeSeconds: z.number().nullable(),
      retryCount: z.number().int().nonnegative(),
      manuallyEdited: z.boolean(),
      notes: z.string().nullable(),
    })).min(1),
  })).min(1).max(3),
});

export type ResultAnalysisInput = z.infer<typeof resultAnalysisInputSchema>;

export const generatedResultAnalysisSchema = z.object({
  winnerReason: z.string().trim().min(1).max(1200),
  products: z.array(z.object({
    productId: z.string().uuid(),
    headline: z.string().trim().min(1).max(300),
    strengths: textList,
    weaknesses: textList,
    bestFor: textList,
    notIdealFor: textList,
    keyFindings: textList,
  })).min(1).max(3),
  crossProductInsights: textList,
  recommendationSummary: z.string().trim().min(1).max(2000),
  limitations: textList,
  counterintuitiveFindings: z.array(z.string().trim().min(1)).max(5),
});

export type GeneratedResultAnalysis = z.infer<typeof generatedResultAnalysisSchema>;
