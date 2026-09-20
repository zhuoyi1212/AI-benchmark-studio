import "server-only";

import { createHash } from "node:crypto";
import type { AIMessageContent } from "@/lib/ai/types";
import { AIProviderError, AIValidationError } from "@/lib/ai/errors";
import { experienceFindingsOutputSchema, type ExperienceFindingsOutput } from "@/lib/ai/schemas/findings.schemas";
import { aiTaskService } from "@/lib/ai/task-service";
import { findingsRepository } from "@/lib/repositories/findings.repository";
import { RepositoryError } from "@/lib/repositories/repository-error";
import { createInputSignature } from "@/lib/signatures";
import { getProjectMode, type ProjectMode } from "@/lib/project-mode";
import { getResearchWorkspace } from "@/lib/services/research.service";
import { getTestExecutionWorkspace } from "@/lib/services/test-execution.service";
import type { ExperienceFindingRow, Json } from "@/lib/types/database";
import type { TestArtifact, TestExecutionWorkspace } from "@/lib/types/test-run";

const maxTextCharacters = 120_000;
const textMimeTypes = new Set(["text/plain", "text/markdown", "application/json", "text/csv"]);

export type FindingsArtifact = {
  artifactId: string;
  productId: string;
  productName: string;
  testCaseId: string;
  testCaseTitle: string;
  fileName: string;
  mimeType: string;
  fileUrl: string;
  caption: string | null;
};

export type ExperienceFindingsWorkspace = {
  projectId: string;
  projectName: string;
  projectIntent: string;
  projectMode: ProjectMode;
  protocolId: string;
  protocolVersion: number;
  products: Array<{ id: string; name: string }>;
  testCases: Array<{ id: string; title: string; objective: string; prompt: string }>;
  artifacts: FindingsArtifact[];
  latest: {
    id: string;
    version: number;
    status: ExperienceFindingRow["status"];
    errorMessage: string | null;
    completedAt: string | null;
    humanConfirmedAt: string | null;
    aiOutput: ExperienceFindingsOutput | null;
    effectiveOutput: ExperienceFindingsOutput | null;
  } | null;
};

export class FindingsExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FindingsExecutionError";
  }
}

export async function getExperienceFindingsWorkspace(projectId: string): Promise<ExperienceFindingsWorkspace | null> {
  const [test, research] = await Promise.all([
    getTestExecutionWorkspace(projectId),
    getResearchWorkspace(projectId),
  ]);
  if (!test || !research?.completedResult) return null;
  const ready = test.testRuns.length > 0 && test.testRuns.every((run) => run.status === "ready_for_review" && run.artifacts.length > 0);
  if (!ready) return null;

  const rows = await findingsRepository.list(projectId, test.protocol.id);
  const latest = rows[0] ?? null;
  return {
    projectId,
    projectName: test.project.name,
    projectIntent: research.project.intent,
    projectMode: getProjectMode(test.project.products),
    protocolId: test.protocol.id,
    protocolVersion: test.protocol.version,
    products: test.project.products.map((product) => ({ id: product.id, name: product.name })),
    testCases: test.protocol.testCases.map((testCase) => ({
      id: testCase.id,
      title: testCase.title,
      objective: testCase.objective,
      prompt: testCase.prompt,
    })),
    artifacts: flattenArtifacts(test),
    latest: latest ? mapFindingRun(latest) : null,
  };
}

export async function generateExperienceFindings(projectId: string): Promise<string> {
  const [test, research] = await Promise.all([
    getTestExecutionWorkspace(projectId),
    getResearchWorkspace(projectId),
  ]);
  if (!test || !research?.completedResult) throw new FindingsExecutionError("请先完成测试计划、真实测试和原始证据上传。");
  if (test.testRuns.length === 0 || test.testRuns.some((run) => run.status !== "ready_for_review" || run.artifacts.length === 0)) {
    throw new FindingsExecutionError("请先确认全部 TestRun 都已保存真实 Artifact。");
  }

  const snapshot = buildSnapshot(test, research.completedResult);
  const inputSignature = createInputSignature(snapshot);
  let findingsId: string | null = null;

  try {
    findingsId = await findingsRepository.begin(projectId, test.protocol.id, snapshot, inputSignature);
    const persisted = (await findingsRepository.list(projectId, test.protocol.id)).find((row) => row.id === findingsId);
    if (!persisted) throw new RepositoryError("findings.requirePersisted", { message: "Findings not found" });
    if (persisted.status === "completed") return persisted.id;
    if (persisted.status !== "pending") throw new RepositoryError("findings.requirePending", { message: "Findings is not pending" });

    const content = await buildArtifactContent(test, research.completedResult);
    const result = await aiTaskService.generateFindings({
      schema: experienceFindingsOutputSchema,
      schemaName: "ExperienceFindings",
      messages: [
        {
          role: "system",
          content: [
            "你是 AI 产品真实体验的 Findings 编辑，不是评分员。",
            "只根据给定 Research 背景、Locked Test Plan、TestRun 元数据和完整原始 Artifact 提炼可观察发现。",
            "不要生成分数、排名、冠军或总评等级。重点找：明确好用的功能、体验一般的功能、不能用/难用/明显有问题的功能。",
            "每条 finding 必须绑定真实 productId、testCaseId 和至少一个 evidenceArtifactId。",
            "observation 写本次实际观察到的现象；impact 写它对真实使用者意味着什么。二者不能重复。",
            "不能从单个失败样本扩大成整个品类的失败率；例如只测到一个学校网站导入失败，只能描述这个网站/这次任务失败。",
            "若问题可能来自测试环境、输入文件或证据缺失，要明确写进 limitation，不能直接归因为产品能力。",
            "Research 只作为产品定位背景，不能覆盖真实 Artifact。",
            "输出简体中文。finding id 使用简短的英文小写 slug。",
          ].join("\n"),
        },
        { role: "user", content },
      ],
      maxTokens: 10_000,
      maxAttempts: 2,
      beforeExecute: (route) => findingsRepository.start(persisted.id, route),
    });

    assertEvidenceReferences(result.data, test);
    await findingsRepository.complete(persisted.id, result.data, result.usage);
    return persisted.id;
  } catch (error) {
    if (findingsId) {
      try { await findingsRepository.fail(findingsId, safeFailureMessage(error)); } catch { /* preserve original error */ }
    }
    if (error instanceof FindingsExecutionError) throw error;
    throw new FindingsExecutionError(toUserFacingError(error));
  }
}

export async function confirmExperienceFindings(projectId: string, findingsId: string, value: unknown): Promise<void> {
  const workspace = await getExperienceFindingsWorkspace(projectId);
  if (!workspace?.latest || workspace.latest.id !== findingsId || workspace.latest.status !== "completed") {
    throw new FindingsExecutionError("当前 Findings 不存在或还未生成完成。");
  }
  const output = experienceFindingsOutputSchema.parse(value);
  const allowedProducts = new Set(workspace.products.map((item) => item.id));
  const allowedCases = new Set(workspace.testCases.map((item) => item.id));
  const artifacts = new Map(workspace.artifacts.map((item) => [item.artifactId, item]));

  for (const finding of output.findings) {
    if (!allowedProducts.has(finding.productId) || !allowedCases.has(finding.testCaseId)) {
      throw new FindingsExecutionError("发现项引用了当前项目之外的产品或测试场景。");
    }
    for (const artifactId of finding.evidenceArtifactIds) {
      const artifact = artifacts.get(artifactId);
      if (!artifact || artifact.productId !== finding.productId || artifact.testCaseId !== finding.testCaseId) {
        throw new FindingsExecutionError("发现项必须引用同一产品、同一 TestCase 的真实 Artifact。");
      }
    }
  }

  await findingsRepository.confirm(findingsId, output);
}

function buildSnapshot(test: TestExecutionWorkspace, research: NonNullable<Awaited<ReturnType<typeof getResearchWorkspace>>>["completedResult"]): Json {
  return JSON.parse(JSON.stringify({
    project: { id: test.project.id, name: test.project.name },
    protocol: {
      id: test.protocol.id,
      version: test.protocol.version,
      title: test.protocol.title,
      goal: test.protocol.goal,
      testCases: test.protocol.testCases.map((item) => ({
        id: item.id,
        position: item.position,
        title: item.title,
        objective: item.objective,
        prompt: item.prompt,
        observationFocus: item.observationFocus,
      })),
    },
    research: research?.products.map((product) => ({
      productId: product.productId,
      positioning: product.positioning,
      capabilities: product.capabilities,
      limitations: product.limitations,
    })),
    runs: test.testRuns.map((run) => ({
      id: run.id,
      productId: run.productId,
      testCaseId: run.testCaseId,
      generationTimeSeconds: run.generationTimeSeconds ?? null,
      retryCount: run.retryCount ?? 0,
      manuallyEdited: run.manuallyEdited ?? false,
      notes: run.notes ?? null,
      artifacts: run.artifacts.map((artifact) => ({
        id: artifact.id,
        kind: artifact.kind,
        fileName: artifact.fileName,
        mimeType: artifact.fileType,
        sizeBytes: artifact.sizeBytes,
        sha256: artifact.sha256 ?? null,
      })),
    })),
  })) as Json;
}

async function buildArtifactContent(
  test: TestExecutionWorkspace,
  research: NonNullable<Awaited<ReturnType<typeof getResearchWorkspace>>>["completedResult"],
): Promise<AIMessageContent> {
  const content: Exclude<AIMessageContent, string> = [{
    type: "text",
    text: JSON.stringify({
      project: { id: test.project.id, name: test.project.name },
      products: test.project.products.map((item) => ({ id: item.id, name: item.name })),
      research: research?.products.map((item) => ({
        productId: item.productId,
        positioning: item.positioning,
        capabilities: item.capabilities,
        limitations: item.limitations,
      })),
      protocol: {
        id: test.protocol.id,
        version: test.protocol.version,
        title: test.protocol.title,
        goal: test.protocol.goal,
        testCases: test.protocol.testCases.map((item) => ({
          id: item.id,
          title: item.title,
          objective: item.objective,
          prompt: item.prompt,
          observationFocus: item.observationFocus,
        })),
      },
    }),
  }];

  for (const run of test.testRuns) {
    const product = test.project.products.find((item) => item.id === run.productId);
    const testCase = test.protocol.testCases.find((item) => item.id === run.testCaseId);
    if (!product || !testCase) throw new FindingsExecutionError("TestRun 与当前测试计划不一致。");

    for (const artifact of run.artifacts) {
      if (!artifact.fileUrl) throw new FindingsExecutionError("原始 Artifact 缺少可读取地址。");
      content.push({
        type: "text",
        text: `Product: ${product.name}; productId: ${product.id}; TestCase: ${testCase.title}; testCaseId: ${testCase.id}; artifactId: ${artifact.id}; MIME: ${artifact.fileType}; TestRun notes: ${run.notes ?? "none"}`,
      });
      if (textMimeTypes.has(artifact.fileType.toLowerCase())) {
        content.push({ type: "text", text: await readTextArtifact(artifact) });
      } else if (artifact.fileType.startsWith("image/")) {
        content.push({ type: "image_url", image_url: { url: artifact.fileUrl } });
      } else {
        content.push({ type: "file_url", file_url: { url: artifact.fileUrl } });
      }
    }
  }
  return content;
}

async function readTextArtifact(artifact: TestArtifact) {
  const response = await fetch(artifact.fileUrl!);
  if (!response.ok) throw new FindingsExecutionError("无法读取原始文本 Artifact。");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length !== artifact.sizeBytes) throw new FindingsExecutionError("原始文本 Artifact 大小校验失败。");
  if (artifact.sha256 && createHash("sha256").update(bytes).digest("hex") !== artifact.sha256) {
    throw new FindingsExecutionError("原始文本 Artifact 完整性校验失败。");
  }
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new FindingsExecutionError("原始文本 Artifact 不是有效 UTF-8。"); }
  if (text.length > maxTextCharacters) throw new FindingsExecutionError("单个文本 Artifact 超出 Findings 处理上限。");
  return text;
}

function assertEvidenceReferences(output: ExperienceFindingsOutput, test: TestExecutionWorkspace) {
  const products = new Set(test.project.products.map((item) => item.id));
  const cases = new Set(test.protocol.testCases.map((item) => item.id));
  const artifactById = new Map(test.testRuns.flatMap((run) => run.artifacts.map((artifact) => [artifact.id, { productId: run.productId, testCaseId: run.testCaseId }] as const)));
  if (new Set(output.findings.map((item) => item.id)).size !== output.findings.length) {
    throw new AIValidationError("findings", "uniqueFindingIds");
  }
  for (const finding of output.findings) {
    if (!products.has(finding.productId) || !cases.has(finding.testCaseId)) throw new AIValidationError("findings", "realProductAndCaseReferences");
    if (finding.evidenceArtifactIds.some((id) => {
      const artifact = artifactById.get(id);
      return !artifact || artifact.productId !== finding.productId || artifact.testCaseId !== finding.testCaseId;
    })) throw new AIValidationError("findings", "realArtifactReferences");
  }
}

function flattenArtifacts(test: TestExecutionWorkspace): FindingsArtifact[] {
  return test.testRuns.flatMap((run) => {
    const product = test.project.products.find((item) => item.id === run.productId);
    const testCase = test.protocol.testCases.find((item) => item.id === run.testCaseId);
    if (!product || !testCase) return [];
    return run.artifacts.filter((artifact) => artifact.fileUrl).map((artifact) => ({
      artifactId: artifact.id,
      productId: product.id,
      productName: product.name,
      testCaseId: testCase.id,
      testCaseTitle: testCase.title,
      fileName: artifact.fileName,
      mimeType: artifact.fileType,
      fileUrl: artifact.fileUrl!,
      caption: run.notes ?? null,
    }));
  });
}

function mapFindingRun(row: ExperienceFindingRow): ExperienceFindingsWorkspace["latest"] {
  const aiOutput = row.output ? experienceFindingsOutputSchema.parse(row.output) : null;
  const humanOutput = row.human_output ? experienceFindingsOutputSchema.parse(row.human_output) : null;
  return {
    id: row.id,
    version: row.version,
    status: row.status,
    errorMessage: row.error_message,
    completedAt: row.completed_at,
    humanConfirmedAt: row.human_confirmed_at,
    aiOutput,
    effectiveOutput: humanOutput ?? aiOutput,
  };
}

function safeFailureMessage(error: unknown) {
  if (error instanceof AIValidationError) return `Findings validation failed: ${error.schemaName}`;
  if (error instanceof AIProviderError) return "AI Provider request failed";
  if (error instanceof RepositoryError) return `Findings persistence failed at ${error.operation}`;
  if (error instanceof FindingsExecutionError) return error.message;
  return "Findings generation failed";
}

function toUserFacingError(error: unknown) {
  if (error instanceof AIValidationError) return "AI 提炼的 Findings 未通过真实证据引用校验，请重试。";
  if (error instanceof AIProviderError) return "AI Provider 暂时无法提炼测试发现，请稍后重试。";
  if (error instanceof RepositoryError) return "Findings 保存失败，请刷新后重试。";
  return "测试发现生成失败，请稍后重试。";
}
