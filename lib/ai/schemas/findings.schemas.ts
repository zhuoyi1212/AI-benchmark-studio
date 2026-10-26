import { z } from "zod";
import { authorPerspectiveSchema } from '@/lib/ai/schemas/publish.schemas';

const text = z.string().trim().min(1);
export const findingCategorySchema = z.enum(["good", "neutral", "problem"]);

export const experienceFindingItemSchema = z.object({
  id: z.string().trim().min(2).max(80).regex(/^[a-z0-9][a-z0-9-]*$/),
  productId: z.string().uuid(),
  testCaseId: z.string().uuid(),
  title: text.max(240),
  category: findingCategorySchema,
  observation: text.max(1800),
  impact: text.max(1200),
  evidenceArtifactIds: z.array(z.string().uuid()).min(1).max(9),
  confidence: z.number().min(0).max(1),
});

export const experienceFindingsOutputSchema = z.object({
  summary: text.max(2400),
  findings: z.array(experienceFindingItemSchema).min(1).max(12),
  limitations: z.array(text.max(1000)).min(1).max(8),
});

export type ExperienceFindingItem = z.infer<typeof experienceFindingItemSchema>;
export type ExperienceFindingsOutput = z.infer<typeof experienceFindingsOutputSchema>;

// Keep author input outside the provider schema so AI cannot invent a human voice.
export const confirmedFindingsOutputSchema = experienceFindingsOutputSchema.extend({
  authorPerspective: authorPerspectiveSchema.optional(),
});
export type ConfirmedFindingsOutput = z.infer<typeof confirmedFindingsOutputSchema>;
