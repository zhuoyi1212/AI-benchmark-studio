import "server-only";
import { memoPageRead } from "@/lib/supabase/read-scope";
import { complianceBaselineRules } from "@/lib/compliance-baseline";
import { projectsRepository } from "@/lib/repositories/projects.repository";

import { z } from "zod";
import { AIConfigurationError, AIProviderError, AIValidationError } from "@/lib/ai/errors";
import {
  expectedOutputTypes,
  generatedProtocolDraftContentSchema,
  generatedProtocolSchema,
  mandatoryProtocolRuleIds,
  type GeneratedProtocolContent,
} from "@/lib/ai/schemas/protocol.schemas";
import { aiTaskService } from "@/lib/ai/task-service";
import { RepositoryError } from "@/lib/repositories/repository-error";
import {
  protocolsRepository,
  type ProtocolTestCaseRow,
} from "@/lib/repositories/protocols.repository";
import { testExecutionRepository } from "@/lib/repositories/test-execution.repository";
import { createInputSignature } from "@/lib/signatures";
import { getProjectMode, type EvaluationMode } from "@/lib/project-mode";
import {
  deriveProtocolInputConstraints,
  validateProtocolFeasibility,
  type ProtocolFeasibilityIssue,
  type ProtocolInputConstraints,
} from "@/lib/protocol-feasibility";
import { getResearchWorkspace, type ResearchWorkspace } from "@/lib/services/research.service";
import type { ProtocolRow, RubricDimensionRow } from "@/lib/types/database";
import type { RubricDimension, TestCase, TestProtocol, TestRule } from "@/lib/types/protocol";

const storedRuleSchema = z.array(z.object({ id: z.enum(mandatoryProtocolRuleIds), text: z.string().trim().min(1) })).length(mandatoryProtocolRuleIds.length);
const storedTextListSchema = z.array(z.string().trim().min(1));
const storedExpectedOutputTypesSchema = z.array(z.enum(expectedOutputTypes)).min(1);
const storedInputArtifactsSchema = z.array(z.object({
  name: z.string().trim().min(1),
  type: z.string().trim().min(1),
  description: z.string().trim().nullable().optional(),
  content: z.string().min(1).optional(),
}));
const storedScoringStandardSchema = z.object({ excellent: z.string().trim().min(1), good: z.string().trim().min(1), acceptable: z.string().trim().min(1), poor: z.string().trim().min(1) });

const capabilityModelingSequence = [
  "productType",
  "primaryProblem",
  "coreCapabilities",
  "differentiatingCapabilities",
  "realisticUseCases",
] as const;

const taskQualityChecks = [
  "对应至少一个已识别的核心能力",
  "是真实用户可能提出并希望产品端到端完成的任务",
  "能产生可观察、可留证、可评分的结果或过程",
  "与其他 TestCase 不高度重复，能扩展核心能力覆盖",
  "不是脱离产品定位、任何普通聊天机器人都能基本完成的泛化任务",
  "不存在更能体现产品原生或差异化能力的替代任务",
] as const;

const genericTasksToDeprioritize = [
  "写文章",
  "写营销文案",
  "写邮件",
  "总结给定文字",
  "Brainstorm",
  "普通知识问答",
] as const;

const standardizedProtocolRules = [
  { id: "same-input", text: "使用相同原始输入" },
  { id: "same-prompt", text: "使用相同 Prompt" },
  { id: "single-generation", text: "每个 Prompt 只生成一次" },
  { id: "no-editing", text: "不进行人工二次编辑" },
  { id: "complete-upload", text: "完整上传原始测试结果" },
] as const;

const standardizedExecutionRules = [
  "使用产品默认设置和默认工作流完成任务",
  "每个 Prompt 只执行一次，不进行人工二次编辑",
  "完整保留原始输出、工具调用或执行过程证据",
] as const;

export type ProtocolWorkspace = {
  research: ResearchWorkspace;
  protocol: TestProtocol | null;
  versionCount: number;
  inputConstraints: ProtocolInputConstraints | null;
  feasibilityIssues: ProtocolFeasibilityIssue[];
};

export class ProtocolExecutionError extends Error {
  constructor(message: string) { super(message); this.name = "ProtocolExecutionError"; }
}

export async function getProtocolWorkspace(projectId: string): Promise<ProtocolWorkspace | null> {
  return memoPageRead(`protocol:${projectId}`, () => readProtocolWorkspace(projectId));
}

// A locked test/review only needs the stored protocol. Reading it must not rebuild
// current product research, progress or reusable research snapshots.
export async function getLockedProtocolContext(projectId: string) {
  return memoPageRead(`locked-protocol:${projectId}`, async () => {
    const [project, protocols] = await Promise.all([
      projectsRepository.findActiveById(projectId), protocolsRepository.listByProject(projectId),
    ]);
    const row = protocols[0];
    if (!project || !row || row.status !== "locked") return null;
    return { project, protocol: await readProtocol(row) };
  });
}

async function readProtocolWorkspace(projectId: string): Promise<ProtocolWorkspace | null> {
  const [research, current] = await Promise.all([
    getResearchWorkspace(projectId),
    protocolsRepository.listByProject(projectId).then(async (protocols) => ({
      protocol: protocols[0] ? await readProtocol(protocols[0]) : null,
      versionCount: protocols.length,
    })),
  ]);
  if (!research) return null;
  const inputConstraints = research.completedResult
    ? deriveProtocolInputConstraints(research.completedResult.products)
    : null;
  const feasibilityIssues = current.protocol && inputConstraints
    ? validateProtocolFeasibility(current.protocol.testCases, inputConstraints)
    : [];
  return { research, ...current, inputConstraints, feasibilityIssues };
}

export async function generateProtocol(projectId: string): Promise<string> {
  const research = await getResearchWorkspace(projectId);
  const result = research?.completedResult;
  if (!research || !result) throw new ProtocolExecutionError("请先完成产品调研，再生成测评方案。");
  const projectMode = getProjectMode(research.project.products);
  const evaluationMode = research.project.evaluationMode;
  const inputConstraints = deriveProtocolInputConstraints(result.products);
  if (projectMode === "comparison" && result.comparability.status === "not_comparable") {
    throw new ProtocolExecutionError("当前产品不适合标准化横向测试，不能生成 Protocol。");
  }

  const inputSnapshot = {
    project: {
      id: research.project.id,
      name: research.project.name,
      intent: research.project.intent,
      mode: projectMode,
      evaluationMode,
      products: research.project.products.map(({ id, name, officialUrl }) => ({ id, name, officialUrl })),
    },
    researchRun: {
      id: result.researchRunId,
      version: result.version,
      products: result.products.map((product) => ({
        productId: product.productId,
        name: product.name,
        positioning: product.positioning,
        targetUsers: product.targetUsers,
        capabilities: product.capabilities,
        keyFeatures: product.keyFeatures,
        officialBestPractices: product.officialBestPractices,
        limitations: product.limitations,
        inputFormats: product.inputFormats,
        outputFormats: product.outputFormats,
        sources: product.sources.map(({ url, sourceType }) => ({ url, sourceType })),
      })),
      comparability: result.comparability,
    },
    invariants: {
      projectMode,
      evaluationMode,
      rubricWeightTotal: 100,
    },
  };
  const inputSignature = createInputSignature(inputSnapshot);
  const generationContext = {
    project: {
      name: research.project.name,
      intent: research.project.intent,
      mode: projectMode,
      products: research.project.products.map(({ name, officialUrl }) => ({ name, officialUrl })),
    },
    research: {
      products: result.products.map((product) => ({
        name: product.name,
        positioning: product.positioning,
        targetUsers: product.targetUsers,
        capabilities: product.capabilities,
        keyFeatures: product.keyFeatures,
        officialBestPractices: product.officialBestPractices,
        limitations: product.limitations,
        inputFormats: product.inputFormats,
        outputFormats: product.outputFormats,
      })),
      ...(projectMode === "comparison" ? { comparability: result.comparability } : {}),
    },
  };

  try {
    const generationStartedAt = performance.now();
    const isAutoDemo = research.project.name.startsWith("AUTO DEMO ·");
    const protocolContentSchema = generatedProtocolDraftContentSchema.superRefine((protocol, context) => {
      const serialized = JSON.stringify(protocol).toLocaleLowerCase("zh-CN");
      if (research.project.products.some((product) => product.name.trim().length >= 3
        && serialized.includes(product.name.trim().toLocaleLowerCase("zh-CN")))) {
        context.addIssue({ code: "custom", path: ["root"], message: "Protocol must use blind-neutral wording and omit every tested product name" });
      }
      const validCaseCount = evaluationMode === "quick"
        ? protocol.testCases.length === 1
        : protocol.testCases.length >= 2 && protocol.testCases.length <= 4;
      if (!validCaseCount) {
        context.addIssue({
          code: "custom",
          path: ["testCases"],
          message: evaluationMode === "quick"
            ? "Quick Protocol must contain exactly one focused task"
            : "Professional Protocol must contain 2-4 distinct tasks",
        });
      }
      if (isAutoDemo && protocol.testCases.some((testCase) => testCase.expectedOutputTypes.some((type) => !["text", "code", "mixed"].includes(type)))) {
        context.addIssue({ code: "custom", path: ["testCases"], message: "AUTO DEMO Protocol must use text, code, or mixed Evidence only" });
      }
      for (const issue of validateProtocolFeasibility(protocol.testCases, inputConstraints)) {
        context.addIssue({ code: "custom", path: ["testCases", issue.testCaseIndex], message: issue.message });
      }
    });
    const generationTask = evaluationMode === "quick"
      ? aiTaskService.generateProtocol
      : aiTaskService.generateProfessionalProtocol;
    const generated = await generationTask({
      schema: protocolContentSchema,
      schemaName: "ProtocolContent",
      messages: [
        {
          role: "system",
          content: (projectMode === "single"
            ? "根据结构化 Research 设计简体中文单产品体验方案。先在内部完成产品能力建模，再生成真实、可执行、可留证、可评分且不重复的端到端任务。以 Project 名称、官方 URL 和差异化产品形态消解混杂资料；任务领域必须被 positioning、capabilities、keyFeatures 或官方场景直接支持，禁止凭空发明旅行、写作、编程等无关领域。不要把资料中顺带出现的通用对话或写作能力误判为核心能力。按产品类型选择原生工作流：Coding Agent/AI IDE 测 repo 理解、文件与 Shell 工具、编辑、测试和 Agent/Skill；搜索/研究产品测检索、引用与综合；图像/视频产品测生成与编辑；Workflow Agent 测多步骤工具协作；关系沟通或情感产品测情境理解、沟通策略、边界与安全性；写作产品才以写作改写为核心。不得索取私有思维链，只评估可观察过程与结果。必须服从 inputConstraints：不支持文件上传时 inputArtifacts 必须为空，全部任务输入直接放进 Prompt；有字符上限时完整 Prompt 必须低于上限。支持文件且任务需要材料时，必须在 inputArtifacts 提供可下载的完整材料，不得只写文件名或要求用户自行准备。长材料只能选取能独立成立的代表性片段并明确抽样范围；若缩短后无法验证原目标，改选可执行任务，禁止静默截断。Rubric 评价实际体验，不做横向比较；每个全局 Rubric 维度都必须能依据每个 TestCase 的任务要求和预期证据进行实质评分，不能用只适用于单个 Case 的能力作为全局维度。输出使用盲测中性称呼，不得出现产品名称或品牌，也不得搜索互联网或引用尚未产生的结果。所有说明和评分标准保持简洁。"
            : "根据结构化 Research 与 Comparability 设计简体中文横向测评方案。先逐个完成产品能力建模，再只测试所有产品共同且核心的原生工作流。所有产品必须使用相同 Prompt、输入和条件；排除独占能力，但不得为表面公平退化成无意义的通用写作或问答。任务必须真实、可执行、可留证、可评分且不重复。必须服从所有产品的共同 inputConstraints：任一产品不支持文件上传时 inputArtifacts 必须为空；字符上限取所有产品中最小值。长材料只能选取对所有产品公平且能独立成立的代表性片段；若无法保持测试目标，改选任务，禁止静默截断。输出使用盲测中性称呼，不得出现产品名称或品牌，也不得搜索互联网或引用尚未产生的结果。所有说明和评分标准保持简洁。") + "\n" + complianceBaselineRules,
        },
        {
          role: "user",
          content: JSON.stringify({
            ...generationContext,
            requirements: {
              mode: evaluationMode,
              caseCount: evaluationMode === "quick"
                ? { default: 1, min: 1, max: 1 }
                : { default: 3, min: 2, max: 4 },
              rubricCount: { default: 4, min: 3, max: 5 },
              capabilityModeling: { sequence: capabilityModelingSequence, coreCapabilitiesCount: "3-8", inferTypeFromResearch: true },
              qualityGate: {
                checks: taskQualityChecks,
                deprioritizeUnlessCoreToProduct: genericTasksToDeprioritize,
                chooseOneHighestValueNativeOrDifferentiatingWorkflow: evaluationMode === "quick",
              },
              eachCaseInternallyAnswers: ["targetCapabilities", "whyThisTask", "evidenceExpected", "successCriteria"],
              caseOutput: { selfContainedPrompt: true, attachEveryRequiredInput: true, allowedInputArtifactTypes: ["application/pdf", "text/plain", "text/csv"], pdfContentLanguage: "printable English and numbers", expectedOutputTypes, evidenceMustSupportScoring: true },
              inputConstraints,
              rubricOutput: { dynamicForProductAndTasks: true, concise: true, everyDimensionApplicableToEveryTestCase: true, scoringStandardFields: ["excellent", "good", "acceptable", "poor"], weightTotal: 100 },
              comparison: projectMode === "comparison" ? { sharedCoreCapabilitiesOnly: true, samePromptInputAndConditions: true, excludeExclusiveCapabilities: true } : undefined,
            },
          }),
        },
      ],
      maxTokens: evaluationMode === "quick" ? 4500 : 9000,
    });
    const protocol = normalizeGeneratedProtocol(generated.data);
    assertProtocolFitsMode(protocol.testCases.length, evaluationMode);
    const feasibilityIssues = validateProtocolFeasibility(protocol.testCases, inputConstraints);
    if (feasibilityIssues.length) throw new ProtocolExecutionError(`生成的任务无法执行：${feasibilityIssues[0]!.message}。`);
    const protocolId = await protocolsRepository.createDraft({
      projectId,
      researchRunId: result.researchRunId,
      protocol,
      route: generated.route,
      usage: generated.usage,
      inputSignature,
    });
    logProtocolPerformance(evaluationMode, generated, protocol.testCases.length, protocol.rubric.length, Math.round(performance.now() - generationStartedAt));
    return protocolId;
  } catch (error) {
    if (error instanceof ProtocolExecutionError) throw error;
    logProtocolGenerationFailure(projectId, error);
    throw new ProtocolExecutionError(toUserFacingError(error));
  }
}

function normalizeGeneratedProtocol(content: GeneratedProtocolContent) {
  const rubric = normalizeRubricWeights(content.rubric);
  return generatedProtocolSchema.parse({
    ...content,
    testMode: "standardized",
    rules: standardizedProtocolRules,
    testCases: content.testCases.map((testCase, index) => ({
      ...testCase,
      position: index + 1,
      executionRules: standardizedExecutionRules,
    })),
    rubric: rubric.map((dimension, index) => ({ ...dimension, position: index + 1 })),
  });
}

function normalizeRubricWeights(rubric: GeneratedProtocolContent["rubric"]): GeneratedProtocolContent["rubric"] {
  const total = rubric.reduce((sum, dimension) => sum + dimension.weight, 0);
  if (Math.abs(total - 100) <= 0.0001) return rubric;
  const normalized = rubric.map((dimension) => ({ ...dimension, weight: Number((dimension.weight / total * 100).toFixed(2)) }));
  const precedingTotal = normalized.slice(0, -1).reduce((sum, dimension) => sum + dimension.weight, 0);
  normalized[normalized.length - 1] = { ...normalized.at(-1)!, weight: Number((100 - precedingTotal).toFixed(2)) };
  return normalized;
}

function logProtocolPerformance(
  mode: EvaluationMode,
  generated: Awaited<ReturnType<typeof aiTaskService.generateProtocol>>,
  testCaseCount: number,
  rubricCount: number,
  wallLatencyMs: number,
) {
  const finalAttempt = generated.attemptPerformance.at(-1);
  console.info("[ProtocolPerformance]", {
    mode,
    model: generated.route.model,
    reasoning: finalAttempt?.reasoning ?? generated.route.reasoning,
    attempt: generated.attempts,
    inputTokens: generated.usage.inputTokens,
    outputTokens: generated.usage.outputTokens,
    latencyMs: generated.usage.latencyMs,
    wallLatencyMs,
    testCaseCount,
    rubricCount,
    attempts: generated.attemptPerformance,
  });
}

function assertProtocolFitsMode(testCaseCount: number, mode: EvaluationMode) {
  const valid = mode === "quick" ? testCaseCount === 1 : testCaseCount >= 2 && testCaseCount <= 4;
  if (!valid) throw new AIValidationError("protocol", `${mode}ProjectTestCaseCount`);
}

export async function lockProtocol(projectId: string, protocolId: string): Promise<void> {
  const workspace = await getProtocolWorkspace(projectId);
  if (!workspace?.protocol) throw new ProtocolExecutionError("没有可锁定的 Protocol 草稿。");
  if (workspace.protocol.id !== protocolId) throw new ProtocolExecutionError("只能锁定当前最新的 Protocol 版本。");
  if (workspace.protocol.status !== "draft") throw new ProtocolExecutionError("当前 Protocol 已锁定，不能重复操作。");
  if (workspace.feasibilityIssues.length) {
    throw new ProtocolExecutionError(`当前任务无法执行：${workspace.feasibilityIssues[0]!.message}。请重新生成方案。`);
  }
  try {
    await protocolsRepository.lock(protocolId);
    // TestRun creation belongs to the explicit lock transition. Reading the
    // Test page must not advance workflow state.
    await testExecutionRepository.ensureMatrix(projectId, protocolId);
  } catch (error) {
    throw new ProtocolExecutionError(toUserFacingError(error));
  }
}

export async function removeDraftTestCase(projectId: string, protocolId: string, testCaseId: string): Promise<void> {
  const workspace = await getProtocolWorkspace(projectId);
  if (!workspace?.protocol) throw new ProtocolExecutionError("没有可编辑的测评方案。");
  if (workspace.protocol.id !== protocolId) throw new ProtocolExecutionError("只能编辑当前最新的测评方案。");
  if (workspace.protocol.status !== "draft") throw new ProtocolExecutionError("方案锁定后不能删除任务。");
  if (!workspace.protocol.testCases.some((testCase) => testCase.id === testCaseId)) {
    throw new ProtocolExecutionError("没有找到这个测试任务。");
  }
  if (workspace.protocol.testCases.length <= 1) {
    throw new ProtocolExecutionError("至少保留 1 个测试任务。");
  }
  try {
    await protocolsRepository.removeDraftTestCase(projectId, protocolId, testCaseId);
  } catch (error) {
    throw new ProtocolExecutionError(toUserFacingError(error));
  }
}

async function readProtocol(row: ProtocolRow): Promise<TestProtocol> {
  const [testCaseRows, rubricRows] = await Promise.all([protocolsRepository.listTestCases(row.id), protocolsRepository.listRubric(row.id)]);
  const rules = storedRuleSchema.parse(row.rules) satisfies TestRule[];
  return {
    id: row.id,
    projectId: row.project_id,
    researchRunId: row.research_run_id,
    version: row.version,
    title: row.title,
    goal: row.goal,
    status: row.status,
    testMode: row.test_mode,
    rules,
    testCases: testCaseRows.map((testCase) => mapTestCase(testCase, row.project_id)),
    rubric: rubricRows.map(mapRubricDimension),
    createdAt: row.created_at,
    lockedAt: row.locked_at ?? undefined,
  };
}

function mapTestCase(row: ProtocolTestCaseRow, projectId: string): TestCase {
  const expectedOutputParse = storedExpectedOutputTypesSchema.safeParse(row.expected_output_types);
  const evidenceParse = storedTextListSchema.safeParse(row.evidence_requirements);
  return {
    id: row.id,
    title: row.title,
    objective: row.objective,
    prompt: row.prompt,
    inputDescription: row.input_description ?? undefined,
    inputArtifacts: storedInputArtifactsSchema.parse(row.input_artifacts).map((artifact, index) => {
      const type = normalizeInputArtifactType(artifact.type);
      return {
        id: `${row.id}-input-${index + 1}`,
        name: artifact.name,
        type,
        description: artifact.description ?? "完成任务所需的标准化输入材料。",
        downloadUrl: artifact.content ? `/api/projects/${projectId}/protocol-inputs/${row.id}/${index + 1}` : undefined,
      };
    }),
    expectedOutputTypes: expectedOutputParse.success ? expectedOutputParse.data : ["mixed"],
    evidenceRequirements: evidenceParse.success ? evidenceParse.data : ["上传该测试项未经后期编辑的原始输出"],
    observationFocus: storedTextListSchema.parse(row.observation_focus),
    executionRules: storedTextListSchema.parse(row.execution_rules),
  };
}

function normalizeInputArtifactType(type: string): "application/pdf" | "text/plain" | "text/csv" {
  const normalized = type.toLowerCase();
  if (normalized.includes("pdf")) return "application/pdf";
  if (normalized.includes("csv")) return "text/csv";
  return "text/plain";
}

function mapRubricDimension(row: RubricDimensionRow): RubricDimension {
  return { id: row.id, name: row.name, weight: Number(row.weight), description: row.description ?? undefined, scoringStandard: storedScoringStandardSchema.parse(row.scoring_standard) };
}

function toUserFacingError(error: unknown) {
  if (error instanceof AIValidationError) return "AI 已返回结果，但方案结构校验失败，请重新生成。";
  if (error instanceof AIConfigurationError) return "AI 服务配置异常，请检查服务端配置。";
  if (error instanceof AIProviderError) {
    if (error.category === "timeout") return "AI 生成方案耗时超过限制，已重试但仍未成功，请重新尝试。";
    if (error.category === "rate_limit") return "AI 服务当前请求较多，已重试但仍未成功，请稍后再试。";
    if (error.category === "provider_5xx") return "AI 服务暂时异常，已重试但仍未成功，请稍后重试。";
    if (error.category === "authentication") return "AI 服务配置异常，请检查服务端配置。";
    if (error.category === "bad_request") return "AI 服务拒绝了方案请求，请检查服务端模型配置或请求参数。";
    if (error.category === "empty_response") return "AI 服务返回了空结果，请重新尝试。";
    if (error.category === "truncated_response") return "AI 返回内容因长度限制被截断，已重试但仍未完成，请重新生成。";
    if (error.category === "invalid_envelope") return "AI 服务返回格式异常，请重新生成。";
    if (error.category === "invalid_json_body") return "AI 服务返回了无法解析的响应，请稍后重试。";
    return "AI 服务网络连接失败，已重试但仍未成功，请稍后重试。";
  }
  if (error instanceof RepositoryError) return "Protocol 保存或锁定失败，请刷新后重试。";
  return "Protocol 生成失败，请稍后重试。";
}

function logProtocolGenerationFailure(projectId: string, error: unknown) {
  console.error("[ProtocolGenerationFailure]", {
    projectId,
    errorType: error instanceof Error ? error.name : "UnknownError",
    provider: error instanceof AIProviderError ? error.provider : null,
    model: error instanceof AIProviderError ? error.model : null,
    task: error instanceof AIProviderError || error instanceof AIValidationError ? error.task : "protocol",
    status: error instanceof AIProviderError ? error.status : null,
    attempt: error instanceof AIProviderError ? error.attempt : null,
    latencyMs: error instanceof AIProviderError ? error.latencyMs : null,
    finishReason: error instanceof AIProviderError ? error.finishReason : null,
    inputTokens: error instanceof AIProviderError ? error.inputTokens : null,
    outputTokens: error instanceof AIProviderError ? error.outputTokens : null,
    responseContentType: error instanceof AIProviderError ? error.responseContentType : null,
    responseBodyLength: error instanceof AIProviderError ? error.responseBodyLength : null,
    errorCategory: error instanceof AIProviderError ? error.category : error instanceof AIValidationError ? error.category : error instanceof AIConfigurationError ? "configuration" : error instanceof RepositoryError ? "repository" : "unexpected",
    validationIssues: error instanceof AIValidationError ? error.issues : null,
    repositoryOperation: error instanceof RepositoryError ? error.operation : null,
  });
}
