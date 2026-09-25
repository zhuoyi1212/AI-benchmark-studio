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
const printableDocumentText = z.string().trim().min(200).max(8000).refine(
  (value) => /^[\x09\x0A\x0D\x20-\x7E]+$/.test(value),
  "Generated PDF source text must use printable ASCII so it renders consistently",
);
const printableDocumentDescription = z.string().trim().min(1).max(500).refine(
  (value) => /^[\x20-\x7E]+$/.test(value),
  "Generated PDF descriptions must use printable ASCII so they render consistently",
);

const protocolRuleSchema = z.object({
  id: z.enum(mandatoryProtocolRuleIds),
  text: z.string().trim().min(1).max(300),
});

const inputArtifactSpecSchema = z.discriminatedUnion("type", [
  z.object({
    name: z.string().trim().min(1).max(180),
    type: z.literal("application/pdf"),
    description: printableDocumentDescription,
    content: printableDocumentText,
  }),
  z.object({
    name: z.string().trim().min(1).max(180),
    type: z.literal("text/plain"),
    description: z.string().trim().min(1).max(500),
    content: z.string().trim().min(100).max(8000),
  }),
  z.object({
    name: z.string().trim().min(1).max(180),
    type: z.literal("text/csv"),
    description: z.string().trim().min(1).max(500),
    content: z.string().trim().min(40).max(8000),
  }),
]);

const scoringStandardSchema = z.object({
  excellent: conciseText,
  good: conciseText,
  acceptable: conciseText,
  poor: conciseText,
});

const intelligentTestCaseSchema = z.object({
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
});

const aiTestCaseSchema = intelligentTestCaseSchema.omit({ position: true, executionRules: true });

const intelligentRubricSchema = z.object({
  position: z.number().int().min(1).max(12),
  name: z.string().trim().min(1).max(120),
  weight: z.number().positive().max(100),
  description: z.string().trim().min(1).max(1000),
  scoringStandard: scoringStandardSchema,
});

const aiRubricSchema = intelligentRubricSchema.omit({ position: true });

const generatedProtocolContentShape = z.object({
  title: z.string().trim().min(1).max(200),
  goal: detailedText,
  testCases: z.array(aiTestCaseSchema).min(1).max(4),
  rubric: z.array(aiRubricSchema).min(3).max(5),
});

export const generatedProtocolDraftContentSchema = generatedProtocolContentShape.superRefine(validateProtocolIdentity);
export const generatedProtocolContentSchema = generatedProtocolContentShape.superRefine(validateProtocolSemantics);

export const generatedProtocolSchema = z.object({
  title: z.string().trim().min(1).max(200),
  goal: detailedText,
  testMode: z.literal("standardized"),
  rules: z.array(protocolRuleSchema).length(mandatoryProtocolRuleIds.length),
  testCases: z.array(intelligentTestCaseSchema).min(1).max(4),
  rubric: z.array(intelligentRubricSchema).min(3).max(5),
}).superRefine((protocol, context) => {
  const ruleIds = protocol.rules.map((rule) => rule.id);
  if (new Set(ruleIds).size !== mandatoryProtocolRuleIds.length
    || mandatoryProtocolRuleIds.some((id) => !ruleIds.includes(id))) {
    context.addIssue({ code: "custom", path: ["rules"], message: "Every mandatory standardized rule is required exactly once" });
  }
  validateUniquePositions(protocol.testCases, "testCases", context);
  validateUniquePositions(protocol.rubric, "rubric", context);
  validateProtocolSemantics(protocol, context);
});

function validateProtocolSemantics(
  protocol: { testCases: Array<{ title: string }>; rubric: Array<{ name: string; weight: number }> },
  context: z.RefinementCtx,
) {
  validateProtocolIdentity(protocol, context);
  const totalWeight = protocol.rubric.reduce((total, item) => total + item.weight, 0);
  if (Math.abs(totalWeight - 100) > 0.0001) {
    context.addIssue({ code: "custom", path: ["rubric"], message: "Rubric weights must total exactly 100" });
  }
}

function validateProtocolIdentity(
  protocol: { testCases: Array<{ title: string }>; rubric: Array<{ name: string }> },
  context: z.RefinementCtx,
) {
  validateUniqueText(protocol.testCases.map((item) => item.title), "testCases", context);
  validateUniqueText(protocol.rubric.map((item) => item.name), "rubric", context);
}

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
export type GeneratedProtocolContent = z.infer<typeof generatedProtocolContentSchema>;
