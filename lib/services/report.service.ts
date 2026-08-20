import "server-only";

import { AIProviderError, AIValidationError } from "@/lib/ai/errors";
import {
  generatedReportSchema,
  generatedReportResponseSchema,
  reportGenerationInputSchema,
  type GeneratedReport,
  type ReportGenerationInput,
} from "@/lib/ai/schemas/report.schemas";
import { generatedResultAnalysisSchema, resultAnalysisInputSchema } from "@/lib/ai/schemas/result-analysis.schemas";
import { aiTaskService } from "@/lib/ai/task-service";
import { reportRepository } from "@/lib/repositories/report.repository";
import { RepositoryError } from "@/lib/repositories/repository-error";
import { getProjectMode, type ProjectMode } from "@/lib/project-mode";
import { resultAnalysisRepository } from "@/lib/repositories/result-analysis.repository";
import { testExecutionRepository } from "@/lib/repositories/test-execution.repository";
import { calculateInputRanking, getResultsWorkspace } from "@/lib/services/result-analysis.service";
import type { Json, ReportRow } from "@/lib/types/database";

export type ReportEvidence = {
  artifactId: string;
  productId: string;
  testCaseId: string;
  fileName: string;
  mimeType: string;
  fileUrl: string;
  caption: string | null;
};

export type ReportWorkspace = {
  projectId: string;
  projectName: string;
  projectIntent: string;
  projectMode: ProjectMode;
  resultAnalysisId: string;
  protocol: ReportGenerationInput["experiment"]["protocol"];
  review: ReportGenerationInput["experiment"]["review"];
  research: ReportGenerationInput["research"];
  ranking: ReportGenerationInput["lockedRanking"];
  caseScores: ReportGenerationInput["caseScores"];
  analysis: ReportGenerationInput["analysis"];
  report: {
    id: string;
    version: number;
    status: ReportRow["status"];
    errorMessage: string | null;
    provider: ReportRow["provider"];
    model: string | null;
    promptVersion: string | null;
    completedAt: string | null;
    content: GeneratedReport | null;
  } | null;
  evidence: ReportEvidence[];
};

export class ReportGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportGenerationError";
  }
}

export async function getReportWorkspace(projectId: string): Promise<ReportWorkspace | null> {
  const source = await getCurrentSource(projectId);
  if (!source) return null;
  const reports = await reportRepository.listByAnalysis(source.analysisRow.id);
  const latest = reports[0] ?? null;
  const [evidence, research] = await Promise.all([
    latest ? getEvidence(latest.id, source.input) : Promise.resolve([]),
    loadResearch(source),
  ]);
  return {
    projectId,
    projectName: source.input.project.name,
    projectIntent: source.input.project.intent,
    projectMode: source.projectMode,
    resultAnalysisId: source.analysisRow.id,
    protocol: source.input.protocol,
    review: source.input.review,
    research,
    ranking: source.ranking,
    caseScores: source.caseScores,
    analysis: source.analysis,
    report: latest ? {
      id: latest.id,
      version: latest.version,
      status: latest.status,
      errorMessage: latest.error_message,
      provider: latest.provider,
      model: latest.model,
      promptVersion: latest.prompt_version,
      completedAt: latest.completed_at,
      content: latest.content ? generatedReportSchema.parse(latest.content) : null,
    } : null,
    evidence,
  };
}

export async function generateReport(projectId: string): Promise<string> {
  const source = await getCurrentSource(projectId);
  if (!source) throw new ReportGenerationError("请先完成并保存当前 Final Result Analysis。");
  let reportId: string | null = null;
  try {
    reportId = await reportRepository.begin(projectId, source.analysisRow.id);
    const persisted = (await reportRepository.listByAnalysis(source.analysisRow.id)).find((report) => report.id === reportId);
    if (!persisted) throw new RepositoryError("report.requirePersisted", { message: "Report not found" });
    if (persisted.status === "completed") return persisted.id;
    if (persisted.status !== "pending") throw new RepositoryError("report.requirePending", { message: "Report is not pending" });

    const input = await createReportInput(source);
    const result = await aiTaskService.generateReport({
      schema: generatedReportResponseSchema,
      schemaName: "BenchmarkReport",
      messages: [
        {
          role: "system",
          content: source.projectMode === "single"
            ? "你是 AI 产品深度体验报告编辑。只组织输入中已锁定的 Final Score、Final Result Analysis、Protocol、真实 Research 与证据；不得重新判分、改变 Judge Evidence 或限制，不得创造实验中不存在的事实。报告必须是一款产品的真实体验报告，包含一句话结论、体验动机、产品定位、方法、各体验场景、最佳表现、暴露问题、适合与不适合人群、最终体验结论和限制；禁止排名、冠军或第一名叙事。whyTheseProducts 字段仅作为兼容字段，表达为什么体验这款产品。输出简体中文。"
            : "你是 AI 产品深度测评报告编辑。只组织输入中已经锁定的 Final Score、排名、冠军、Final Result Analysis、Protocol、真实 Research 与证据；不得重新判分，不得改变排名、冠军、Judge Evidence 或限制，不得创造实验中不存在的事实。正文需包含清晰 TL;DR、方法、选品原因、逐 Case 复盘与最终建议。用户可见文案不得输出 UUID、数据库字段名或内部 ID。输出简体中文。",
        },
        {
          role: "user",
          content: JSON.stringify({
            reportSource: input,
            projectMode: source.projectMode,
            immutableFields: source.projectMode === "single" ? "唯一产品的 score、analysis 与 experiment evidence 均只读；不要把数组顺序表达成排名。" : "lockedRanking 的 score/order、analysis 的 winnerReason/products/limitations 与 experiment 中的 evidence 均只读。输出 Schema 不包含这些字段，请只生成表达性内容。",
            coverage: "caseReviews 必须且只能覆盖全部 TestCase；每个 Case 的 productAnalyses 必须且只能覆盖全部产品。",
          }),
        },
      ],
      maxTokens: 14_000,
      maxAttempts: 2,
      beforeExecute: (route) => reportRepository.start(persisted.id, route),
    });
    assertExactCoverage(result.data, input);
    await reportRepository.complete(persisted.id, result.data, result.usage);
    return persisted.id;
  } catch (error) {
    if (reportId) {
      try {
        await reportRepository.fail(reportId, safeFailureMessage(error));
      } catch {
        // Preserve the original error and the auditable run state when possible.
      }
    }
    if (error instanceof ReportGenerationError) throw error;
    throw new ReportGenerationError(toUserFacingError(error));
  }
}

async function getCurrentSource(projectId: string) {
  const results = await getResultsWorkspace(projectId);
  const current = results?.latestAnalysis;
  if (!results || !current || current.stale || current.status !== "completed" || !current.output) return null;
  const analysisRow = await resultAnalysisRepository.getById(current.id);
  if (!analysisRow || analysisRow.project_id !== projectId || analysisRow.status !== "completed" || !analysisRow.output) return null;
  const input = resultAnalysisInputSchema.parse(analysisRow.input_snapshot);
  const analysis = generatedResultAnalysisSchema.parse(analysisRow.output);
  const ranking = calculateInputRanking(input);
  return { results, analysisRow, input, analysis, ranking, caseScores: calculateCaseScores(input), projectMode: getProjectMode(input.products) };
}

async function createReportInput(source: NonNullable<Awaited<ReturnType<typeof getCurrentSource>>>) {
  const input = {
    resultAnalysisId: source.analysisRow.id,
    experiment: source.input,
    research: await loadResearch(source),
    lockedRanking: source.ranking,
    caseScores: source.caseScores,
    analysis: source.analysis,
  };
  const parsed = reportGenerationInputSchema.parse(input);
  assertExactSet(parsed.research.map((item) => item.productId), parsed.lockedRanking.map((item) => item.productId), "research products");
  return parsed;
}

async function loadResearch(source: NonNullable<Awaited<ReturnType<typeof getCurrentSource>>>) {
  const rows = await reportRepository.listResearchForProtocol(source.analysisRow.protocol_id);
  const research: ReportGenerationInput["research"] = rows.map((row) => ({
    productId: row.product_id,
    positioning: row.positioning,
    targetUsers: asArray(row.target_users),
    capabilities: asArray(row.capabilities),
    keyFeatures: asArray(row.key_features),
    pricing: row.pricing,
    limitations: asArray(row.limitations),
    sources: asArray(row.sources),
  }));
  assertExactSet(research.map((item) => item.productId), source.ranking.map((item) => item.productId), "research products");
  return research;
}

function calculateCaseScores(input: ReportGenerationInput["experiment"]): ReportGenerationInput["caseScores"] {
  return input.protocol.testCases.map((testCase) => ({
    testCaseId: testCase.id,
    products: input.products.map((product) => ({
      productId: product.productId,
      score: roundOne(input.protocol.rubric.reduce((total, dimension) => {
        const scores = product.scores.filter((score) => score.testCaseId === testCase.id && score.rubricDimensionId === dimension.id);
        if (scores.length === 0) throw new ReportGenerationError("报告 Case 评分矩阵不完整。");
        return total + average(scores.map((score) => score.finalScore)) * dimension.weight / 100;
      }, 0)),
    })).sort((left, right) => right.score - left.score || left.productId.localeCompare(right.productId)),
  }));
}

async function getEvidence(reportId: string, input: ReportGenerationInput["experiment"]): Promise<ReportEvidence[]> {
  const links = await reportRepository.listArtifactLinks(reportId);
  const rows = await reportRepository.listArtifacts(links.map((link) => link.artifact_id));
  const linkByArtifact = new Map(links.map((link) => [link.artifact_id, link]));
  const lineage = new Map(input.products.flatMap((product) => product.artifacts.map((artifact) => [artifact.artifactId, {
    productId: product.productId,
    testCaseId: artifact.testCaseId,
  }] as const)));
  return Promise.all(rows.map(async (row) => {
    const relation = lineage.get(row.id);
    if (!relation) throw new ReportGenerationError("报告证据与 ResultAnalysis 输入不一致。");
    return {
      artifactId: row.id,
      productId: relation.productId,
      testCaseId: relation.testCaseId,
      fileName: row.file_name,
      mimeType: row.mime_type,
      fileUrl: await testExecutionRepository.createSignedUrl(row.storage_path),
      caption: linkByArtifact.get(row.id)?.caption ?? null,
    };
  }));
}

function assertExactCoverage(output: GeneratedReport, input: ReportGenerationInput) {
  assertExactSet(output.caseReviews.map((item) => item.testCaseId), input.experiment.protocol.testCases.map((item) => item.id), "report test cases");
  const productIds = input.lockedRanking.map((item) => item.productId);
  for (const review of output.caseReviews) {
    assertExactSet(review.productAnalyses.map((item) => item.productId), productIds, `products for ${review.testCaseId}`);
  }
}

function assertExactSet(actual: string[], expected: string[], schemaName: string) {
  const expectedSet = new Set(expected);
  if (actual.length !== expectedSet.size || new Set(actual).size !== expectedSet.size || actual.some((id) => !expectedSet.has(id))) {
    throw new AIValidationError("report", schemaName);
  }
}

function asArray(value: Json): Json[] {
  if (!Array.isArray(value)) throw new ReportGenerationError("报告来源数据格式无效。");
  return value;
}

function average(values: number[]) { return values.reduce((total, value) => total + value, 0) / values.length; }
function roundOne(value: number) { return Math.round(value * 10) / 10; }

function safeFailureMessage(error: unknown) {
  if (error instanceof AIValidationError) return "Report validation failed";
  if (error instanceof AIProviderError) return "AI Provider request failed";
  if (error instanceof RepositoryError) return `Report persistence failed at ${error.operation}`;
  if (error instanceof ReportGenerationError) return error.message;
  return "Report generation failed";
}

function toUserFacingError(error: unknown) {
  if (error instanceof AIValidationError) return "深度报告返回的数据未通过结构校验，请重新生成。";
  if (error instanceof AIProviderError) return "AI Provider 暂时无法生成深度报告，请稍后重试。";
  if (error instanceof RepositoryError) return "深度报告数据保存失败，请刷新后重试。";
  return "深度报告生成失败，请稍后重试。";
}
