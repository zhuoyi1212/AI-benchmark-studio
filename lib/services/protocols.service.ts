import "server-only";

import { z } from "zod";
import { AIConfigurationError, AIProviderError, AIValidationError } from "@/lib/ai/errors";
import {
  expectedOutputTypes,
  generatedProtocolSchema,
  mandatoryProtocolRuleIds,
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
        sources: product.sources.map(({ title, url, sourceType, snippet }) => ({ title, url, sourceType, snippet })),
      })),
      comparability: result.comparability,
    },
    invariants: {
      projectMode,
      testMode: "standardized",
      mandatoryRuleIds: mandatoryProtocolRuleIds,
      rubricWeightTotal: 100,
      protocolMustBeLockedBeforeTesting: true,
    },
  };
  const inputSignature = createInputSignature(inputSnapshot);

  try {
    const generated = await aiTaskService.generateProtocol({
      schema: generatedProtocolSchema,
      schemaName: "TestProtocol",
      messages: [
        {
          role: "system",
          content: projectMode === "single"
            ? "你是严谨但高效的 AI 产品体验实验设计师。只基于 Project Intent 与已保存 ProductResearch 工作。生成任务前必须先在内部完成产品能力建模：判断产品类型、主要解决的问题、3–8 个真正值得测试的核心能力、区别于普通聊天模型的差异化能力，以及用户现实中会为了什么目标使用这些能力；不要把这段内部分析原样输出。然后设计 2–4 个高价值、端到端、可执行、可留证的真实用户任务。任务优先测试产品原生能力；若任务复制到普通聊天机器人中也可基本完成，且该能力并非产品核心定位，必须替换为更能体现产品特点的任务。不同 TestCase 应覆盖不同的核心能力组合，不得只更换题材重复测试同一种能力。Rubric 评价实际体验，不得写成相对其他产品的比较。Protocol 不得出现被测产品名称或品牌，以保持后续评分 Blind。不要搜索互联网，不要引用尚未存在的结果。输出简体中文。"
            : "你是严谨但高效的 AI 产品实验设计师。只基于给定 Project Intent、已保存 ProductResearch 与 Comparability 工作。生成任务前必须先在内部逐个建立产品能力模型，再从 Comparability 的共同可比能力中选择这些产品真正核心的交集。设计 2–4 个高价值、端到端、可执行、可留证的真实用户任务；同一 TestCase 必须向所有产品提供相同 Prompt、输入与执行条件。不得用某个产品独有而其他产品无法完成的能力进行横向评分，也不得为了表面公平退化成与产品定位无关的泛化写作或问答。若 Comparability 没有足够共同能力，不得强行制造测试。Rubric 根据共同任务动态选择 3–5 个可由当前证据验证的重要维度。Protocol 不得出现任何被测产品名称或品牌，以保证后续 Blind Review。不要搜索互联网，不要引用尚未存在的测试结果。输出简体中文。",
        },
        {
          role: "user",
          content: JSON.stringify({
            ...inputSnapshot,
            requirements: {
              preferredTestCaseCount: projectMode === "single"
                ? "2-4 high-value experience cases; maximize distinct core-capability coverage without padding"
                : "2-4; simple benchmarks may use 2 and must not pad the count",
              preferredRubricDimensionCount: "3-5 dynamic dimensions",
              preserveMandatoryRuleIdsExactlyOnce: true,
              samePromptAndInputForEveryProductWithinEachCase: projectMode === "comparison",
              evaluateActualExperienceInsteadOfRelativePerformance: projectMode === "single",
              selfContainedPromptWhenNoInputArtifactWasSupplied: true,
              doNotInventUnavailableFiles: true,
              expectedOutputTypesMustUse: expectedOutputTypes,
              evidenceRequirementsMustDescribeRawEvidenceNeededForReliableJudging: true,
              evidenceMustSupportEverySelectedRubricDimension: true,
              scoringStandardMustDefine: ["excellent", "good", "acceptable", "poor"],
              positionsMustBeContiguousFromOne: true,
              singleProductFocus: projectMode === "single" ? ["核心能力", "真实用户场景", "官方卖点验证", "明显优缺点"] : undefined,
              capabilityModeling: {
                requiredBeforeTaskDesign: true,
                analysisSequence: capabilityModelingSequence,
                productTypeMustBeInferredFromResearchRatherThanAClosedCategoryList: true,
                coreCapabilitiesCount: "3-8",
                coreCapabilitiesMustDescribeProductNativeActionsRatherThanBroadAILabels: true,
                differentiatingCapabilitiesMustExplainWhatOrdinaryChatbotsCannotCompleteEquivalently: true,
                realisticUseCasesMustBeGoalsRealUsersWouldDelegateToTheProduct: true,
              },
              taskDesign: {
                nativeCapabilitiesTakePriorityOverGenericLlmCapabilities: true,
                completeARealGoalRatherThanDemonstrateAnIsolatedCapability: true,
                genericChatbotTransferTest: "If an ordinary chatbot can basically complete the task without the product's native environment, tools, workflow, or modality, reject it unless Research shows that capability is central to the product.",
                deprioritizeUnlessCentralToProduct: genericTasksToDeprioritize,
                writingTasksRemainValidForWritingMarketingCopyOrGeneralAssistantProducts: true,
                eachCaseMustInternallyDefine: ["targetCapabilities", "whyThisTask", "evidenceExpected", "successCriteria"],
                mapInternalRationaleToExistingSchema: {
                  objective: ["targetCapabilities", "whyThisTask"],
                  evidenceRequirements: ["evidenceExpected"],
                  observationFocusAndScoringStandard: ["successCriteria"],
                },
                taskPromptMustBeSelfContainedAndOperational: true,
                testCaseCapabilityCoverageMustBeMeaningfullyDistinct: true,
              },
              comparisonGuardrails: projectMode === "comparison" ? {
                chooseOnlyCoreCapabilitiesSharedByEveryProduct: true,
                useComparabilityCommonCapabilitiesAsTheFairnessBoundary: true,
                neverScoreAProductOnAnotherProductsExclusiveCapability: true,
                preserveIdenticalPromptInputAndConditionsPerCase: true,
              } : undefined,
              finalTaskQualityReview: {
                requiredBeforeReturningProtocol: true,
                checks: taskQualityChecks,
                replaceGenericTaskWhenGenericCapabilityIsNotCorePositioning: true,
                rejectMechanicallyCreatedCasesAddedOnlyToCoverRubricDimensions: true,
              },
            },
          }),
        },
      ],
      maxTokens: 10000,
    });
    assertProtocolFitsMode(generated.data.testCases.length, projectMode);
    return await protocolsRepository.createDraft({
      projectId,
      researchRunId: result.researchRunId,
      protocol: generated.data,
      route: generated.route,
      usage: generated.usage,
      inputSignature,
    });
  } catch (error) {
    if (error instanceof ProtocolExecutionError) throw error;
    logProtocolGenerationFailure(projectId, error);
    throw new ProtocolExecutionError(toUserFacingError(error));
  }
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
    if (error.category === "invalid_response") return "AI 服务已返回响应，但内容无法解析，请重新生成。";
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
    errorCategory: error instanceof AIProviderError ? error.category : error instanceof AIValidationError ? "schema_validation" : error instanceof AIConfigurationError ? "configuration" : error instanceof RepositoryError ? "repository" : "unexpected",
    repositoryOperation: error instanceof RepositoryError ? error.operation : null,
  });
}
