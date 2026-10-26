import "server-only";
import { analysisExecutionExpired } from "@/lib/analysis-lifecycle";

import { memoPageRead } from "@/lib/supabase/read-scope";
import { createHash } from "node:crypto";
import { getProjectMode, type ProjectMode } from "@/lib/project-mode";
import { AIProviderError, AIValidationError } from "@/lib/ai/errors";
import {
  generatedResultAnalysisSchema,
  resultAnalysisInputSchema,
  type GeneratedResultAnalysis,
  type ResultAnalysisInput,
} from "@/lib/ai/schemas/result-analysis.schemas";
import { aiTaskService } from "@/lib/ai/task-service";
import { resultAnalysisRepository } from "@/lib/repositories/result-analysis.repository";
import { RepositoryError } from "@/lib/repositories/repository-error";
import { getHumanReviewWorkspace, type HumanReviewWorkspace } from "@/lib/services/human-review.service";
import type { ResultAnalysisRow } from "@/lib/types/database";

export type FinalProductScore = {
  productId: string;
  productName: string;
  sampleId: string;
  sampleLabel: string;
  finalScore: number;
  dimensionScores: Array<{ dimensionId: string; name: string; score: number }>;
  adjustedCount: number;
};

export type ResultsWorkspace = {
  projectId: string;
  projectMode: ProjectMode;
  protocolVersion: number;
  reviewSessionId: string;
  finalScoreSignature: string;
  rubric: HumanReviewWorkspace["rubric"];
  reviewSummary: HumanReviewWorkspace["summary"];
  productScores: FinalProductScore[];
  caseScores: Array<{ testCaseId: string; title: string; products: Array<{ productId: string; score: number }> }>;
  caseEvidence: Array<{
    testCaseId: string;
    title: string;
    products: Array<{
      productId: string;
      productName: string;
      findings: Array<{
        dimensionName: string;
        finalScore: number;
        reason: string;
        evidence: string[];
        humanAdjustment: string | null;
      }>;
    }>;
  }>;
  latestAnalysis: {
    id: string;
    attempt: number;
    status: ResultAnalysisRow["status"];
    stale: boolean;
    errorMessage: string | null;
    provider: ResultAnalysisRow["provider"];
    model: string | null;
    promptVersion: string | null;
    output: GeneratedResultAnalysis | null;
  } | null;
};

export class ResultAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResultAnalysisError";
  }
}

export async function getResultsWorkspace(projectId: string): Promise<ResultsWorkspace | null> {
  return memoPageRead(`results:${projectId}`, () => readResultsWorkspace(projectId));
}

async function readResultsWorkspace(projectId: string): Promise<ResultsWorkspace | null> {
  const review = await getHumanReviewWorkspace(projectId);
  if (!review || review.status !== "revealed" || !review.revealedMappings) return null;
  const finalScoreSignature = createFinalScoreSignature(review);
  const analyses = await resultAnalysisRepository.listByReview(review.reviewSessionId, 1);
  const latest = analyses[0] ?? null;
  const productScores = calculateProductScores(review);
  return {
    projectId,
    projectMode: getProjectMode(productScores),
    protocolVersion: review.protocolVersion,
    reviewSessionId: review.reviewSessionId,
    finalScoreSignature,
    rubric: review.rubric,
    reviewSummary: review.summary,
    productScores,
    caseScores: calculateReviewCaseScores(review),
    caseEvidence: buildCaseEvidence(review),
    latestAnalysis: latest ? {
      id: latest.id,
      attempt: latest.attempt,
      status: analysisExecutionExpired(latest) ? "failed" : latest.status,
      stale: latest.final_score_signature !== finalScoreSignature,
      errorMessage: analysisExecutionExpired(latest) ? "分析任务已超时，可重新生成；本次记录已保留。" : latest.error_message,
      provider: latest.provider,
      model: latest.model,
      promptVersion: latest.prompt_version,
      output: latest.output ? generatedResultAnalysisSchema.parse(latest.output) : null,
    } : null,
  };
}

function buildCaseEvidence(review: HumanReviewWorkspace): ResultsWorkspace["caseEvidence"] {
  return review.testCases.map((testCase) => ({
    testCaseId: testCase.id,
    title: testCase.title,
    products: review.revealedMappings!.map((mapping) => ({
      productId: mapping.productId,
      productName: mapping.productName,
      findings: review.rubric.map((dimension) => {
        const score = review.scores.find((item) => item.testCaseId === testCase.id
          && item.blindSampleId === mapping.sampleId
          && item.rubricDimensionId === dimension.id);
        if (!score) throw new ResultAnalysisError("Results Case 证据矩阵不完整。");
        return {
          dimensionName: dimension.name,
          finalScore: score.finalScore,
          reason: sanitizePublicEvidence(score.reason),
          evidence: score.evidence.map(sanitizePublicEvidence),
          humanAdjustment: score.humanOverride ? sanitizePublicEvidence(score.humanOverride.reason) : null,
        };
      }),
    })),
  }));
}

function sanitizePublicEvidence(value: string) {
  return value
    .replace(/\bArtifact\s+[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "原始证据")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "原始证据")
    .replace(/\b(?:blindSampleId|TestRun|artifactId|productId|testCaseId|rubricDimensionId)\b/gi, "证据标识");
}

export async function generateFinalResultAnalysis(projectId: string): Promise<string> {
  const review = await getHumanReviewWorkspace(projectId);
  if (!review || review.status !== "revealed") throw new ResultAnalysisError("产品身份揭晓后才能生成最终结果分析。");
  let analysisId: string | null = null;
  try {
    const previous = (await resultAnalysisRepository.listByReview(review.reviewSessionId, 1))[0];
    if (previous && analysisExecutionExpired(previous)) await resultAnalysisRepository.fail(previous.id, "分析任务已超时，保留本次记录并允许重试。");
    analysisId = await resultAnalysisRepository.begin(projectId, review.reviewSessionId);
    const persisted = (await resultAnalysisRepository.listByReview(review.reviewSessionId)).find((analysis) => analysis.id === analysisId);
    if (!persisted) throw new RepositoryError("resultAnalysis.requirePersisted", { message: "ResultAnalysis not found" });
    if (persisted.status === "completed") return persisted.id;
    if (persisted.status !== "pending") throw new RepositoryError("resultAnalysis.requirePending", { message: "ResultAnalysis is not pending" });

    const input = resultAnalysisInputSchema.parse(persisted.input_snapshot);
    const ranking = calculateInputRanking(input);
    const projectMode = getProjectMode(input.products);
    const result = await aiTaskService.analyzeFinalResults({
      schema: generatedResultAnalysisSchema,
      schemaName: "FinalResultAnalysis",
      messages: [
        {
          role: "system",
          content: projectMode === "single"
            ? "你是 AI 产品真实体验的最终分析师。只基于已揭晓身份的锁定 Final Score、Rubric、TestCase、Judge Evidence、人工复核与 Artifact metadata，分析这个产品的综合体验、各场景表现、亮点、问题、适合与不适合人群、关键发现和限制。不得使用排名、冠军或相对竞品措辞，不得改变分数或证据，不得创造实验中不存在的数据。winnerReason 字段仅作为兼容字段，填写一句话总体体验结论；crossProductInsights 字段仅作为兼容字段，填写产品关键发现。输出简体中文。"
            : "你是 AI 产品测评的最终分析师。只基于已揭晓身份的锁定 Final Score、Rubric、TestCase、Judge Evidence、人工复核与 Artifact metadata 解释结果。不得改变任何分数、排名、冠军或证据，不得创造实验中不存在的数据。结论需区分综合得分与具体用户适配；用户可见文案不得输出 UUID、数据库字段名或内部 ID。输出简体中文。",
        },
        {
          role: "user",
          content: JSON.stringify(projectMode === "single" ? {
            experienceScore: ranking[0],
            experiment: input,
            required: "解释综合体验结论、各 Case 与维度表现、产品亮点、问题、适合与不适合人群、关键发现和测试限制。不要生成排名、冠军或横向比较结论。products 必须且只能覆盖唯一产品。",
          } : {
            lockedRanking: ranking,
            experiment: input,
            required: "解释 winner、每款产品优势/劣势/适合与不适合人群、跨产品洞察、反直觉发现和测试限制。products 必须且只能覆盖 lockedRanking 中的 productId。",
          }),
        },
      ],
      maxTokens: 10_000,
      maxAttempts: 2,
      beforeExecute: (route) => resultAnalysisRepository.start(persisted.id, route),
    });
    assertExactProducts(result.data, ranking.map((product) => product.productId));
    await resultAnalysisRepository.complete(persisted.id, ranking[0]!.productId, result.data, result.usage);
    return persisted.id;
  } catch (error) {
    if (analysisId) {
      try {
        await resultAnalysisRepository.fail(analysisId, safeFailureMessage(error));
      } catch {
        // Preserve the original failure; a terminal database record remains auditable.
      }
    }
    if (error instanceof ResultAnalysisError) throw error;
    throw new ResultAnalysisError(toUserFacingError(error));
  }
}

function calculateProductScores(review: HumanReviewWorkspace): FinalProductScore[] {
  return review.revealedMappings!.map((mapping) => {
    const dimensionScores = review.rubric.map((dimension) => {
      const scores = review.scores.filter((score) => score.blindSampleId === mapping.sampleId && score.rubricDimensionId === dimension.id);
      return { dimensionId: dimension.id, name: dimension.name, score: roundOne(average(scores.map((score) => score.finalScore))) };
    });
    return {
      productId: mapping.productId,
      productName: mapping.productName,
      sampleId: mapping.sampleId,
      sampleLabel: mapping.sampleLabel,
      finalScore: roundOne(dimensionScores.reduce((total, dimension, index) => total + dimension.score * review.rubric[index]!.weight / 100, 0)),
      dimensionScores,
      adjustedCount: review.scores.filter((score) => score.blindSampleId === mapping.sampleId && score.humanOverride).length,
    };
  }).sort((left, right) => right.finalScore - left.finalScore || left.productId.localeCompare(right.productId));
}

function calculateReviewCaseScores(review: HumanReviewWorkspace) {
  return review.testCases.map((testCase) => ({
    testCaseId: testCase.id,
    title: testCase.title,
    products: review.revealedMappings!.map((mapping) => ({
      productId: mapping.productId,
      score: roundOne(review.rubric.reduce((total, dimension) => {
        const scores = review.scores.filter((score) => score.blindSampleId === mapping.sampleId
          && score.testCaseId === testCase.id
          && score.rubricDimensionId === dimension.id);
        return total + average(scores.map((score) => score.finalScore)) * dimension.weight / 100;
      }, 0)),
    })).sort((left, right) => right.score - left.score || left.productId.localeCompare(right.productId)),
  }));
}

export function calculateInputRanking(input: ResultAnalysisInput) {
  return input.products.map((product) => {
    const dimensions = input.protocol.rubric.map((dimension) => ({
      dimensionId: dimension.id,
      name: dimension.name,
      weight: dimension.weight,
      score: roundOne(average(product.scores.filter((score) => score.rubricDimensionId === dimension.id).map((score) => score.finalScore))),
    }));
    return {
      productId: product.productId,
      productName: product.productName,
      finalScore: roundOne(dimensions.reduce((total, dimension) => total + dimension.score * dimension.weight / 100, 0)),
      dimensionScores: dimensions,
    };
  }).sort((left, right) => right.finalScore - left.finalScore || left.productId.localeCompare(right.productId));
}

function createFinalScoreSignature(review: HumanReviewWorkspace) {
  const canonical = [...review.scores]
    .sort((left, right) => left.judgeScoreId.localeCompare(right.judgeScoreId))
    .map((score) => `${score.judgeScoreId}:${score.finalScore.toFixed(1)}`)
    .join(",");
  return createHash("sha256").update(canonical).digest("hex");
}

function assertExactProducts(output: GeneratedResultAnalysis, expectedProductIds: string[]) {
  const expected = new Set(expectedProductIds);
  const actual = output.products.map((product) => product.productId);
  if (actual.length !== expected.size || new Set(actual).size !== expected.size || actual.some((id) => !expected.has(id))) {
    throw new AIValidationError("result_analysis", "exactProjectProductSet");
  }
}

function average(values: number[]) {
  if (values.length === 0) throw new ResultAnalysisError("Final Score 维度矩阵不完整。");
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function safeFailureMessage(error: unknown) {
  if (error instanceof AIValidationError) return "Final Result Analysis validation failed";
  if (error instanceof AIProviderError) return "AI Provider request failed";
  if (error instanceof RepositoryError) return `Result Analysis persistence failed at ${error.operation}`;
  if (error instanceof ResultAnalysisError) return error.message;
  return "Final Result Analysis failed";
}

function toUserFacingError(error: unknown) {
  if (error instanceof AIValidationError) return "最终分析返回的数据未通过结构校验，请重新生成。";
  if (error instanceof AIProviderError) return "AI Provider 暂时无法完成最终分析，请稍后重试。";
  if (error instanceof RepositoryError) return "最终分析数据保存失败，请刷新后重试。";
  return "最终结果分析失败，请稍后重试。";
}
