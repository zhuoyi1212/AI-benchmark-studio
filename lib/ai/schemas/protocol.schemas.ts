import { z } from "zod";

export const mandatoryProtocolRuleIds = [
  "same-input",
  "same-prompt",
  "single-generation",
  "no-editing",
  "complete-upload",
] as const;

export const expectedOutputTypes = ["text", "image", "document", "video", "code", "mixed"] as const;

const conciseText = z.string().trim().min(1).max(1000);
const detailedText = z.string().trim().min(1).max(8000);
const textList = z.array(z.string().trim().min(1).max(500)).min(1).max(20);

const protocolRuleSchema = z.object({
  id: z.enum(mandatoryProtocolRuleIds),
  text: z.string().trim().min(1).max(300),
});

const inputArtifactSpecSchema = z.object({
  name: z.string().trim().min(1).max(300),
  type: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).nullable(),
});

const scoringStandardSchema = z.object({
  excellent: conciseText,
  good: conciseText,
  acceptable: conciseText,
  poor: conciseText,
});

export const generatedProtocolSchema = z.object({
  title: z.string().trim().min(1).max(200),
  goal: detailedText,
  testMode: z.literal("standardized"),
  rules: z.array(protocolRuleSchema).length(mandatoryProtocolRuleIds.length),
  testCases: z.array(z.object({
    position: z.number().int().min(1).max(12),
    title: z.string().trim().min(1).max(200),
    objective: detailedText,
    prompt: detailedText,
    inputDescription: z.string().trim().max(3000).nullable(),
    inputArtifacts: z.array(inputArtifactSpecSchema).max(12),
    expectedOutputTypes: z.array(z.enum(expectedOutputTypes)).min(1).max(4),
    evidenceRequirements: textList,
    observationFocus: textList,
    executionRules: textList,
  })).min(1).max(12),
  rubric: z.array(z.object({
    position: z.number().int().min(1).max(12),
    name: z.string().trim().min(1).max(120),
    weight: z.number().positive().max(100),
    description: z.string().trim().min(1).max(1000),
    scoringStandard: scoringStandardSchema,
  })).min(2).max(12),
}).superRefine((protocol, context) => {
  const ruleIds = protocol.rules.map((rule) => rule.id);
  if (new Set(ruleIds).size !== mandatoryProtocolRuleIds.length
    || mandatoryProtocolRuleIds.some((id) => !ruleIds.includes(id))) {
    context.addIssue({ code: "custom", path: ["rules"], message: "Every mandatory standardized rule is required exactly once" });
  }
  validateUniquePositions(protocol.testCases, "testCases", context);
  validateUniquePositions(protocol.rubric, "rubric", context);
  validateUniqueText(protocol.testCases.map((item) => item.title), "testCases", context);
  validateUniqueText(protocol.rubric.map((item) => item.name), "rubric", context);
  const totalWeight = protocol.rubric.reduce((total, item) => total + item.weight, 0);
  if (Math.abs(totalWeight - 100) > 0.0001) {
    context.addIssue({ code: "custom", path: ["rubric"], message: "Rubric weights must total exactly 100" });
  }
});

function validateUniquePositions(
  values: Array<{ position: number }>,
  path: "testCases" | "rubric",
  context: z.RefinementCtx,
) {
  const positions = values.map((value) => value.position);
  const expected = values.map((_, index) => index + 1);
  if (new Set(positions).size !== values.length || positions.some((position, index) => position !== expected[index])) {
    context.addIssue({ code: "custom", path: [path], message: "Positions must be contiguous and start at 1" });
  }
}

function validateUniqueText(values: string[], path: "testCases" | "rubric", context: z.RefinementCtx) {
  const normalized = values.map((value) => value.toLocaleLowerCase("zh-CN"));
  if (new Set(normalized).size !== normalized.length) {
    context.addIssue({ code: "custom", path: [path], message: "Names must be unique" });
  }
}

export type GeneratedProtocol = z.infer<typeof generatedProtocolSchema>;
