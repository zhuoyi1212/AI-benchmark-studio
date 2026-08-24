import "server-only";

import { z } from "zod";
import { AIConfigurationError, AIProviderError, AIValidationError } from "@/lib/ai/errors";
import {
  expectedOutputTypes,
  generatedProtocolContentSchema,
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
import { createInputSignature } from "@/lib/signatures";
import { getProjectMode, type ProjectMode } from "@/lib/project-mode";
import { getResearchWorkspace, type ResearchWorkspace } from "@/lib/services/research.service";
import type { ProtocolRow, RubricDimensionRow } from "@/lib/types/database";
import type { RubricDimension, TestCase, TestProtocol, TestRule } from "@/lib/types/protocol";

const storedRuleSchema = z.array(z.object({ id: z.enum(mandatoryProtocolRuleIds), text: z.string().trim().min(1) })).length(mandatoryProtocolRuleIds.length);
const storedTextListSchema = z.array(z.string().trim().min(1));
const storedExpectedOutputTypesSchema = z.array(z.enum(expectedOutputTypes)).min(1);
const storedInputArtifactsSchema = z.array(z.object({ name: z.string().trim().min(1), type: z.string().trim().min(1), description: z.string().nullable().optional() }));
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

export type ProtocolWorkspace = { research: ResearchWorkspace; protocol: TestProtocol | null; versionCount: number };

export class ProtocolExecutionError extends Error {
  constructor(message: string) { super(message); this.name = "ProtocolExecutionError"; }
}

export async function getProtocolWorkspace(projectId: string): Promise<ProtocolWorkspace | null> {
  const research = await getResearchWorkspace(projectId);
  if (!research) return null;
  const protocols = await protocolsRepository.listByProject(projectId);
  const current = protocols[0] ?? null;
  return { research, protocol: current ? await readProtocol(current) : null, versionCount: protocols.length };
}

export async function generateProtocol(projectId: string): Promise<string> {
  const research = await getResearchWorkspace(projectId);
  const result = research?.completedResult;
  if (!research || !result) throw new ProtocolExecutionError("请先完成产品调研，再生成测评方案。");
  const projectMode = getProjectMode(research.project.products);
  if (projectMode === "comparison" && result.comparability.status === "not_comparable") {
    throw new ProtocolExecutionError("当前产品不适合标准化横向测试，不能生成 Protocol。");
  }

  const inputSnapshot = {
    project: {
      id: research.project.id,
      name: research.project.name,
      intent: research.project.intent,
      mode: projectMode,
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
        sources: product.sources.map(({ url, sourceType }) => ({ url, sourceType })),
      })),
      comparability: result.comparability,
    },
    invariants: {
      projectMode,
      rubricWeightTotal: 100,
    },
  };
  const inputSignature = createInputSignature(inputSnapshot);

  try {
    const generationStartedAt = performance.now();
    const protocolContentSchema = generatedProtocolContentSchema.superRefine((protocol, context) => {
      const serialized = JSON.stringify(protocol).toLocaleLowerCase("zh-CN");
      if (research.project.products.some((product) => product.name.trim().length >= 3
        && serialized.includes(product.name.trim().toLocaleLowerCase("zh-CN")))) {
        context.addIssue({ code: "custom", path: ["root"], message: "Protocol must use blind-neutral wording and omit every tested product name" });
      }
    });
    const generated = await aiTaskService.generateProtocol({
      schema: protocolContentSchema,
      schemaName: "ProtocolContent",
      messages: [
        {
          role: "system",
          content: projectMode === "single"
            ? "基于给定 Project 名称、Intent 与结构化 ProductResearch 设计简体中文单产品体验方案。先在内部依次完成 productType → primaryProblem → coreCapabilities → differentiatingCapabilities → realisticUseCases 建模，不输出分析过程。Research 若混有母品牌通用能力与具体产品功能，以 Project 名称、官方 URL 路径及最具差异化的产品形态为准；不要因资料顺带提到通用对话或写作就把它们当成核心能力。将产品类型映射到原生工作流：Coding Agent/AI IDE 测 repo 理解、文件与 Shell 工具、编辑、测试和 Agent/Skill；搜索/研究产品测检索、来源引用与综合；图像/视频产品测生成与编辑；Workflow Agent 测多步骤工具协作；写作产品才以写作改写为核心。优先测试原生交互与差异化工作流，默认 3 个 Case 中至少 2 个必须依赖这些能力。每个任务是端到端真实用户目标，不是演示、介绍或解释某项能力；不得索取私有思维链，只评估可观察的操作、证据和结果。如果任务复制到普通聊天框也能基本完成且不是产品核心定位，必须替换。需要仓库、文件或其他输入时，在 inputArtifacts 中声明真实测试素材，不要虚构其内容。2 个 Case 足够时不凑数，仅有重要且未覆盖的第 4 类能力时生成 4 个。Rubric 默认 4 个维度，简单方案可用 3 个，确有必要才用 5 个。Rubric 评价实际体验，不做跨产品比较。整个输出使用“被测产品/工具”等盲测中性称呼，不得出现任何产品名称或品牌；不要搜索互联网或引用尚未产生的结果。"
            : "基于给定 Project Intent、结构化 ProductResearch 与 Comparability 设计简体中文横向测评方案。先在内部逐个完成 productType → primaryProblem → coreCapabilities → differentiatingCapabilities → realisticUseCases 建模，再只选择所有产品共同且核心的能力。每个 Case 必须给所有产品相同 Prompt、输入和条件，不评分任何产品独占能力，也不能为表面公平退化成无意义的通用写作或问答。任务必须是真实用户目标、可执行、可留证、可评分且彼此不重复。默认 3 个 Case、4 个 Rubric；足够时可分别降至 2 个和 3 个，确有必要才升至 4 个和 5 个。不得出现产品名称或品牌；不要搜索互联网或引用尚未产生的结果。",
        },
        {
          role: "user",
          content: JSON.stringify({
            ...inputSnapshot,
            requirements: {
              caseCount: { default: 3, min: 2, max: 4, useTwoOnlyWhenFewerThanThreeDistinctTestableCoreWorkflows: true, fourthOnlyForDistinctUncoveredCapability: true },
              rubricCount: { default: 4, min: 3, max: 5 },
              capabilityModeling: { sequence: capabilityModelingSequence, coreCapabilitiesCount: "3-8", inferTypeFromResearch: true },
              taskQualityChecks,
              deprioritizeUnlessCoreToProduct: genericTasksToDeprioritize,
              capabilityPriority: {
                resolveMixedResearchByProjectFocus: true,
                defaultCasesUsingNativeOrDifferentiatingWorkflow: 2,
                incidentalGenericCapabilityIsNotCorePositioning: true,
                useObservableWorkflowEvidenceOnly: true,
              },
              eachCaseInternallyAnswers: ["targetCapabilities", "whyThisTask", "evidenceExpected", "successCriteria"],
              caseOutput: { selfContainedPrompt: true, declareRequiredRealInputsInInputArtifacts: true, doNotInventInputContents: true, expectedOutputTypes, evidenceMustSupportScoring: true },
              rubricOutput: { dynamicForProductAndTasks: true, scoringStandardFields: ["excellent", "good", "acceptable", "poor"], weightTotal: 100 },
              comparison: projectMode === "comparison" ? { sharedCoreCapabilitiesOnly: true, samePromptInputAndConditions: true, excludeExclusiveCapabilities: true } : undefined,
            },
          }),
        },
      ],
      maxTokens: 10000,
    });
    const protocol = normalizeGeneratedProtocol(generated.data);
    assertProtocolFitsMode(protocol.testCases.length, projectMode);
    const protocolId = await protocolsRepository.createDraft({
      projectId,
      researchRunId: result.researchRunId,
      protocol,
      route: generated.route,
      usage: generated.usage,
      inputSignature,
    });
    logProtocolPerformance(projectMode, generated, protocol.testCases.length, protocol.rubric.length, Math.round(performance.now() - generationStartedAt));
    return protocolId;
  } catch (error) {
    if (error instanceof ProtocolExecutionError) throw error;
    logProtocolGenerationFailure(projectId, error);
    throw new ProtocolExecutionError(toUserFacingError(error));
  }
}

function normalizeGeneratedProtocol(content: GeneratedProtocolContent) {
  return generatedProtocolSchema.parse({
    ...content,
    testMode: "standardized",
    rules: standardizedProtocolRules,
    testCases: content.testCases.map((testCase, index) => ({
      ...testCase,
      position: index + 1,
      executionRules: standardizedExecutionRules,
    })),
    rubric: content.rubric.map((rubric, index) => ({ ...rubric, position: index + 1 })),
  });
}

function logProtocolPerformance(
  mode: ProjectMode,
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

function assertProtocolFitsMode(testCaseCount: number, mode: ProjectMode) {
  const valid = mode === "single"
    ? testCaseCount >= 2 && testCaseCount <= 4
    : testCaseCount >= 2 && testCaseCount <= 4;
  if (!valid) throw new AIValidationError("protocol", `${mode}ProjectTestCaseCount`);
}

export async function lockProtocol(projectId: string, protocolId: string): Promise<void> {
  const workspace = await getProtocolWorkspace(projectId);
  if (!workspace?.protocol) throw new ProtocolExecutionError("没有可锁定的 Protocol 草稿。");
  if (workspace.protocol.id !== protocolId) throw new ProtocolExecutionError("只能锁定当前最新的 Protocol 版本。");
  if (workspace.protocol.status !== "draft") throw new ProtocolExecutionError("当前 Protocol 已锁定，不能重复操作。");
  try { await protocolsRepository.lock(protocolId); } catch (error) { throw new ProtocolExecutionError(toUserFacingError(error)); }
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
    testCases: testCaseRows.map(mapTestCase),
    rubric: rubricRows.map(mapRubricDimension),
    createdAt: row.created_at,
    lockedAt: row.locked_at ?? undefined,
  };
}

function mapTestCase(row: ProtocolTestCaseRow): TestCase {
  const expectedOutputParse = storedExpectedOutputTypesSchema.safeParse(row.expected_output_types);
  const evidenceParse = storedTextListSchema.safeParse(row.evidence_requirements);
  return {
    id: row.id,
    title: row.title,
    objective: row.objective,
    prompt: row.prompt,
    inputDescription: row.input_description ?? undefined,
    inputArtifacts: storedInputArtifactsSchema.parse(row.input_artifacts).map((artifact, index) => ({ id: `${row.id}-input-${index + 1}`, name: artifact.name, type: artifact.type })),
    expectedOutputTypes: expectedOutputParse.success ? expectedOutputParse.data : ["mixed"],
    evidenceRequirements: evidenceParse.success ? evidenceParse.data : ["上传该测试项未经后期编辑的原始输出"],
    observationFocus: storedTextListSchema.parse(row.observation_focus),
    executionRules: storedTextListSchema.parse(row.execution_rules),
  };
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
