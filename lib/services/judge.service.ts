import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { AIProviderError, AIValidationError } from "@/lib/ai/errors";
import { judgeCaseOutputSchema, type JudgeCaseScoreOutput } from "@/lib/ai/schemas/judge.schemas";
import { aiTaskService } from "@/lib/ai/task-service";
import type { AIMessageContent, JudgeArtifactDescriptor } from "@/lib/ai/types";
import { humanReviewRepository } from "@/lib/repositories/human-review.repository";
import { judgeRepository, type JudgeCaseInputRow } from "@/lib/repositories/judge.repository";
import { RepositoryError } from "@/lib/repositories/repository-error";
import { protocolsRepository, type ProtocolTestCaseRow } from "@/lib/repositories/protocols.repository";
import { createInputSignature } from "@/lib/signatures";
import { BlindReviewError, getBlindReviewWorkspace } from "@/lib/services/blind-review.service";
import type { JudgeCaseRunRow, JudgeRunRow, JudgeScoreRow, RubricDimensionRow } from "@/lib/types/database";
import type { ExpectedOutputType } from "@/lib/types/protocol";

const storedTextListSchema = z.array(z.string().trim().min(1));
const storedRulesSchema = z.array(z.object({ id: z.string(), text: z.string().trim().min(1) }));
const storedScoringStandardSchema = z.object({
  excellent: z.string().trim().min(1),
  good: z.string().trim().min(1),
  acceptable: z.string().trim().min(1),
  poor: z.string().trim().min(1),
});
const storedEvidenceSchema = z.array(z.string().trim().min(1));
const storedExpectedOutputTypesSchema = z.array(z.enum(["text", "image", "document", "video", "code", "mixed"])).min(1);
const maxTextArtifactCharacters = 500_000;
const textArtifactMimeTypes = new Set(["text/plain", "text/markdown", "application/json", "text/csv"]);

type JudgeTestCase = {
  id: string;
  position: number;
  title: string;
  objective: string;
  prompt: string;
  inputDescription: string | null;
  expectedOutputTypes: ExpectedOutputType[];
  evidenceRequirements: string[];
  observationFocus: string[];
  executionRules: string[];
};

type JudgeRubric = {
  id: string;
  position: number;
  name: string;
  weight: number;
  description: string | null;
  scoringStandard: z.infer<typeof storedScoringStandardSchema>;
};

export type JudgeReviewWorkspace = {
  projectId: string;
  protocolId: string;
  protocolVersion: number;
  evaluationMode: import("@/lib/project-mode").EvaluationMode;
  samples: Array<{ sampleId: string; label: string }>;
  testCases: JudgeTestCase[];
  rubric: JudgeRubric[];
  attemptCount: number;
  latestRun: {
    id: string;
    attempt: number;
    status: JudgeRunRow["status"];
    errorMessage: string | null;
    startedAt: string | null;
    completedAt: string | null;
    caseRuns: Array<{
      id: string;
      testCaseId: string;
      status: JudgeCaseRunRow["status"];
      provider: JudgeCaseRunRow["provider"];
      model: string;
      promptVersion: string;
      errorMessage: string | null;
    }>;
    scores: Array<{
      id: string;
      testCaseId: string;
      blindSampleId: string;
      rubricDimensionId: string;
      aiScore: number;
      reason: string;
      evidence: string[];
      confidence: number;
      model: string;
      promptVersion: string;
    }>;
  } | null;
};

export class JudgeExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JudgeExecutionError";
  }
}

export async function getJudgeReviewWorkspace(projectId: string): Promise<JudgeReviewWorkspace | null> {
  const context = await loadJudgeContext(projectId);
  if (!context) return null;
  const runs = await judgeRepository.listRuns(context.protocolId);
  const latest = runs[0] ?? null;
  const [caseRuns, scores] = latest
    ? await Promise.all([judgeRepository.listCaseRuns(latest.id), judgeRepository.listScores(latest.id)])
    : [[], []];
  return {
    projectId,
    protocolId: context.protocolId,
    protocolVersion: context.protocolVersion,
    evaluationMode: context.evaluationMode,
    samples: context.samples,
    testCases: context.testCases,
    rubric: context.rubric,
    attemptCount: runs.length,
    latestRun: latest ? mapRun(latest, caseRuns, scores) : null,
  };
}

export async function runBlindJudge(projectId: string): Promise<string> {
  const context = await loadJudgeContext(projectId);
  if (!context) throw new JudgeExecutionError("Blind Review 尚未就绪。");
  let judgeRunId: string | null = null;
  try {
    judgeRunId = await judgeRepository.begin(projectId, context.protocolId);
    const persistedRun = (await judgeRepository.listRuns(context.protocolId)).find((run) => run.id === judgeRunId);
    if (persistedRun?.status === "completed") {
      await humanReviewRepository.ensure(projectId, context.protocolId);
      return judgeRunId;
    }
    if (!persistedRun || persistedRun.status !== "running") throw new RepositoryError("judge.requireRunning", { message: "JudgeRun did not enter running state" });

    // Provider quotas are shared across Cases. Run them sequentially so one
    // JudgeRun does not create its own rate-limit spike; all Samples inside a
    // Case still use the same immutable JudgeCaseRun route.
    for (const testCase of context.testCases) {
      await executeJudgeCase(judgeRunId, context, testCase);
    }
    await judgeRepository.complete(judgeRunId);
    // The explicit Judge action creates the review session. Reading the
    // Human Review page never advances the workflow.
    await humanReviewRepository.ensure(projectId, context.protocolId);
    return judgeRunId;
  } catch (error) {
    if (judgeRunId) {
      try {
        await judgeRepository.fail(judgeRunId, safeFailureMessage(error));
      } catch {
        // Keep the original execution failure; persisted running state remains auditable for recovery.
      }
    }
    if (error instanceof JudgeExecutionError) throw error;
    throw new JudgeExecutionError(toUserFacingError(error));
  }
}

async function executeJudgeCase(
  judgeRunId: string,
  context: NonNullable<Awaited<ReturnType<typeof loadJudgeContext>>>,
  testCase: JudgeTestCase,
) {
  const inputs = await judgeRepository.listCaseInputs(judgeRunId, testCase.id);
  assertCompleteSampleInputs(inputs, context.samples);
  const descriptors = inputs.map((input): JudgeArtifactDescriptor => ({
    id: input.artifact_id,
    testCaseId: testCase.id,
    mimeType: input.mime_type,
  }));
  const inputSignature = createInputSignature({
    protocolId: context.protocolId,
    testCase,
    rubric: context.rubric,
    samples: context.samples,
    artifacts: inputs.map((input) => ({
      blindSampleId: input.blind_sample_id,
      artifactId: input.artifact_id,
      mimeType: input.mime_type,
      sizeBytes: input.size_bytes,
      sha256: input.sha256,
    })),
  });
  const content = await buildJudgeContent(context, testCase, inputs);
  const expectedScoreKeys = new Set(context.samples.flatMap((sample) => context.rubric.map((dimension) => `${sample.sampleId}:${dimension.id}`)));
  const expectedScorePairs = context.samples.flatMap((sample) => context.rubric.map((dimension) => ({
    blindSampleId: sample.sampleId,
    rubricDimensionId: dimension.id,
  })));
  const exactJudgeCaseOutputSchema = judgeCaseOutputSchema.superRefine((value, refinement) => {
    const actualKeys = value.scores.map((score) => `${score.blindSampleId}:${score.rubricDimensionId}`);
    if (actualKeys.length !== expectedScoreKeys.size || new Set(actualKeys).size !== expectedScoreKeys.size
      || actualKeys.some((key) => !expectedScoreKeys.has(key))) {
      refinement.addIssue({
        code: "custom",
        path: ["scores"],
        message: `Judge output must contain exactly ${expectedScoreKeys.size} unique Sample × Rubric scores`,
      });
    }
  });
  let judgeCaseRunId: string | null = null;
  const result = await aiTaskService.judgeSamples(testCase.id, descriptors, {
    schema: exactJudgeCaseOutputSchema,
    schemaName: "JudgeCaseScores",
    messages: [
      {
        role: "system",
        content: "你是严格的 Blind AI Judge。你只能使用匿名 Sample、Locked Protocol、TestCase、Rubric 与原始 Artifact 评分。不得猜测产品身份，不得使用品牌先验，不得改变 Rubric。每条 Evidence 必须引用给定 Artifact ID，并指出可核查的页面、段落、图表或原文。输出简体中文。",
      },
      { role: "user", content },
    ],
    maxTokens: 9_000,
    maxAttempts: 3,
    validationRepairInstruction: `scores 必须且只能覆盖以下 ${expectedScoreKeys.size} 组 ID，每组恰好一条，不得遗漏、重复或新增；缩短 reason 与 evidence 以避免输出截断：${JSON.stringify(expectedScorePairs)}`,
    beforeExecute: async (route) => {
      judgeCaseRunId = await judgeRepository.beginCase(judgeRunId, testCase.id, route, inputSignature);
    },
  });
  if (!judgeCaseRunId) throw new JudgeExecutionError("JudgeCaseRun 未正确启动。");
  assertExactScoreMatrix(result.data.scores, context.samples, context.rubric);
  await judgeRepository.completeCase(judgeCaseRunId, result.data.scores, result.usage);
}

async function loadJudgeContext(projectId: string) {
  let blind;
  try {
    blind = await getBlindReviewWorkspace(projectId);
  } catch (error) {
    if (error instanceof BlindReviewError) throw new JudgeExecutionError(error.message);
    throw error;
  }
  if (!blind) return null;
  const protocols = await protocolsRepository.listByProject(projectId);
  const protocol = protocols[0];
  if (!protocol || protocol.id !== blind.protocolId || protocol.status !== "locked") return null;
  const [testCaseRows, rubricRows] = await Promise.all([
    protocolsRepository.listTestCases(protocol.id),
    protocolsRepository.listRubric(protocol.id),
  ]);
  const rules = storedRulesSchema.parse(protocol.rules);
  return {
    projectId,
    protocolId: protocol.id,
    protocolVersion: protocol.version,
    evaluationMode: blind.evaluationMode,
    rules,
    samples: blind.samples,
    testCases: testCaseRows.map(mapTestCase),
    rubric: rubricRows.map(mapRubric),
  };
}

async function buildJudgeContent(
  context: NonNullable<Awaited<ReturnType<typeof loadJudgeContext>>>,
  testCase: JudgeTestCase,
  inputs: JudgeCaseInputRow[],
): Promise<AIMessageContent> {
  const prepared = await Promise.all(inputs.map(prepareArtifact));
  const instruction = {
    lockedProtocol: {
      id: context.protocolId,
      version: context.protocolVersion,
      rules: context.rules,
    },
    testCase,
    rubricDimensions: context.rubric,
    blindSamples: context.samples,
    requiredOutput: {
      oneScorePerSampleAndRubricDimension: true,
      exactScoreCount: context.samples.length * context.rubric.length,
      aiScoreRange: "0-10, one decimal",
      confidenceRange: "0-1",
      evidenceMustReferenceArtifactId: true,
    },
  };
  if (prepared.every((artifact) => isTextArtifactMimeType(artifact.mimeType))) {
    return JSON.stringify({
      ...instruction,
      rawArtifacts: prepared.map((artifact) => ({
        blindSampleId: artifact.blindSampleId,
        sampleLabel: artifact.sampleLabel,
        artifactId: artifact.artifactId,
        mimeType: artifact.mimeType,
        sizeBytes: artifact.sizeBytes,
        sha256: artifact.sha256,
        integrityVerified: true,
        content: artifact.text,
      })),
    });
  }

  const content: Exclude<AIMessageContent, string> = [{
    type: "text",
    text: `${JSON.stringify(instruction)}\n下面按 Sample 顺序提供完整原始 Artifact。`,
  }];
  for (const artifact of prepared) {
    content.push({
      type: "text",
      text: `Blind Sample: ${artifact.sampleLabel}; Artifact ID: ${artifact.artifactId}; MIME: ${artifact.mimeType}; Size: ${artifact.sizeBytes} bytes; SHA-256: ${artifact.sha256}; Integrity verified by server.`,
    });
    if (isTextArtifactMimeType(artifact.mimeType)) {
      content.push({ type: "text", text: artifact.text! });
    } else if (artifact.mimeType.startsWith("image/")) {
      content.push({ type: "image_url", image_url: { url: artifact.url! } });
    } else {
      content.push({ type: "file_url", file_url: { url: artifact.url! } });
    }
  }
  return content;
}

async function prepareArtifact(input: JudgeCaseInputRow) {
  const url = await judgeRepository.createSignedArtifactUrl(input.storage_path);
  if (!isTextArtifactMimeType(input.mime_type)) {
    return { blindSampleId: input.blind_sample_id, sampleLabel: input.sample_label, artifactId: input.artifact_id, mimeType: input.mime_type, sizeBytes: input.size_bytes, sha256: input.sha256, url, text: null };
  }
  const response = await fetch(url);
  if (!response.ok) throw new JudgeExecutionError("无法读取原始文本 Artifact。");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length !== input.size_bytes || createHash("sha256").update(bytes).digest("hex") !== input.sha256) {
    throw new JudgeExecutionError("原始文本 Artifact 完整性校验失败。");
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new JudgeExecutionError("原始文本 Artifact 不是有效 UTF-8。");
  }
  if (text.length > maxTextArtifactCharacters) throw new JudgeExecutionError("单个文本 Artifact 超出当前 Judge 处理上限。");
  return { blindSampleId: input.blind_sample_id, sampleLabel: input.sample_label, artifactId: input.artifact_id, mimeType: input.mime_type, sizeBytes: input.size_bytes, sha256: input.sha256, url: null, text };
}

function isTextArtifactMimeType(mimeType: string) {
  return textArtifactMimeTypes.has(mimeType.toLowerCase());
}

function assertCompleteSampleInputs(inputs: JudgeCaseInputRow[], samples: Array<{ sampleId: string; label: string }>) {
  if (inputs.length === 0) throw new JudgeExecutionError("TestCase 没有可评分的原始 Artifact。");
  const inputSamples = new Set(inputs.map((input) => input.blind_sample_id));
  if (samples.some((sample) => !inputSamples.has(sample.sampleId))) {
    throw new JudgeExecutionError("TestCase 的匿名 Sample Artifact 矩阵不完整。");
  }
}

function assertExactScoreMatrix(
  scores: JudgeCaseScoreOutput[],
  samples: Array<{ sampleId: string }>,
  rubric: JudgeRubric[],
) {
  const expected = new Set(samples.flatMap((sample) => rubric.map((dimension) => `${sample.sampleId}:${dimension.id}`)));
  const actual = scores.map((score) => `${score.blindSampleId}:${score.rubricDimensionId}`);
  if (actual.length !== expected.size || new Set(actual).size !== expected.size || actual.some((key) => !expected.has(key))) {
    throw new AIValidationError("judge", "exactSampleByRubricScoreMatrix");
  }
}

function mapTestCase(row: ProtocolTestCaseRow): JudgeTestCase {
  return {
    id: row.id,
    position: row.position,
    title: row.title,
    objective: row.objective,
    prompt: row.prompt,
    inputDescription: row.input_description,
    expectedOutputTypes: storedExpectedOutputTypesSchema.parse(row.expected_output_types),
    evidenceRequirements: storedTextListSchema.parse(row.evidence_requirements),
    observationFocus: storedTextListSchema.parse(row.observation_focus),
    executionRules: storedTextListSchema.parse(row.execution_rules),
  };
}

function mapRubric(row: RubricDimensionRow): JudgeRubric {
  return {
    id: row.id,
    position: row.position,
    name: row.name,
    weight: Number(row.weight),
    description: row.description,
    scoringStandard: storedScoringStandardSchema.parse(row.scoring_standard),
  };
}

function mapRun(run: JudgeRunRow, caseRuns: JudgeCaseRunRow[], scores: JudgeScoreRow[]) {
  return {
    id: run.id,
    attempt: run.attempt,
    status: run.status,
    errorMessage: run.error_message,
    startedAt: run.started_at,
    completedAt: run.completed_at,
    caseRuns: caseRuns.map((caseRun) => ({
      id: caseRun.id,
      testCaseId: caseRun.test_case_id,
      status: caseRun.status,
      provider: caseRun.provider,
      model: caseRun.model,
      promptVersion: caseRun.prompt_version,
      errorMessage: caseRun.error_message,
    })),
    scores: scores.map((score) => ({
      id: score.id,
      testCaseId: score.test_case_id,
      blindSampleId: score.blind_sample_id,
      rubricDimensionId: score.rubric_dimension_id,
      aiScore: Number(score.ai_score),
      reason: score.reason,
      evidence: storedEvidenceSchema.parse(score.evidence),
      confidence: Number(score.confidence),
      model: score.model,
      promptVersion: score.prompt_version,
    })),
  };
}

function safeFailureMessage(error: unknown) {
  if (error instanceof AIValidationError) return "AI Judge structured output validation failed";
  if (error instanceof AIProviderError) return "AI Provider request failed";
  if (error instanceof RepositoryError) return `Judge persistence failed at ${error.operation}`;
  if (error instanceof JudgeExecutionError) return error.message;
  return "AI Judge execution failed";
}

function toUserFacingError(error: unknown) {
  if (error instanceof AIValidationError) return "AI Judge 返回结果未通过评分矩阵校验，请重新运行。";
  if (error instanceof AIProviderError) return "AI Provider 暂时无法完成 Blind Judge，请稍后重试。";
  if (error instanceof RepositoryError) return "AI Judge 数据保存失败，请刷新后重试。";
  return "AI Judge 执行失败，请稍后重试。";
}
