import { z } from "zod";
import { generatedResultAnalysisSchema, resultAnalysisInputSchema } from "@/lib/ai/schemas/result-analysis.schemas";

const reportText = z.string().trim().min(1);

export const reportGenerationInputSchema = z.object({
  resultAnalysisId: z.string().uuid(),
  experiment: resultAnalysisInputSchema,
  research: z.array(z.object({
    productId: z.string().uuid(),
    positioning: z.string().min(1),
    targetUsers: z.array(z.unknown()),
    capabilities: z.array(z.unknown()),
    keyFeatures: z.array(z.unknown()),
    pricing: z.unknown().nullable(),
    limitations: z.array(z.unknown()),
    sources: z.array(z.unknown()).min(1),
  })).min(1).max(3),
  lockedRanking: z.array(z.object({
    productId: z.string().uuid(),
    productName: z.string().min(1),
    finalScore: z.number().min(0).max(10),
    dimensionScores: z.array(z.object({
      dimensionId: z.string().uuid(),
      name: z.string().min(1),
      weight: z.number().positive(),
      score: z.number().min(0).max(10),
    })).min(1),
  })).min(1).max(3),
  caseScores: z.array(z.object({
    testCaseId: z.string().uuid(),
    products: z.array(z.object({
      productId: z.string().uuid(),
      score: z.number().min(0).max(10),
    })).min(1).max(3),
  })).min(1),
  analysis: generatedResultAnalysisSchema,
});

export type ReportGenerationInput = z.infer<typeof reportGenerationInputSchema>;

export const generatedReportSchema = z.object({
  eyebrow: reportText.max(120),
  title: reportText.max(240),
  subtitle: reportText.max(600),
  readingTimeMinutes: z.number().int().min(3).max(60),
  tldr: reportText.max(1200),
  tldrDetail: reportText.max(2400),
  whyTheseProducts: reportText.max(2400),
  methodologySummary: reportText.max(2400),
  caseReviews: z.array(z.object({
    testCaseId: z.string().uuid(),
    findings: reportText.max(2400),
    productAnalyses: z.array(z.object({
      productId: z.string().uuid(),
      analysis: reportText.max(1600),
    })).min(1).max(3),
  })).min(1),
  finalRecommendation: reportText.max(3000),
});

export type GeneratedReport = z.infer<typeof generatedReportSchema>;

const internalIdentifierPattern = /(?:\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b|\b(?:blindSampleId|TestRun|artifactId|productId|testCaseId|rubricDimensionId|finalScoreSignature)\b)/i;

export const generatedReportResponseSchema = generatedReportSchema.superRefine((value, context) => {
  if (internalIdentifierPattern.test(JSON.stringify(value))) {
    context.addIssue({ code: "custom", message: "Report contains an internal identifier" });
  }
});
