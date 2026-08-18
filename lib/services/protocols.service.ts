import "server-only";

import { z } from "zod";
import { AIProviderError, AIValidationError } from "@/lib/ai/errors";
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
import { getProjectMode } from "@/lib/project-mode";
import { createInputSignature } from "@/lib/signatures";
import { getResearchWorkspace, type ResearchWorkspace } from "@/lib/services/research.service";
import type { ProtocolRow, RubricDimensionRow } from "@/lib/types/database";
import type { RubricDimension, TestCase, TestProtocol, TestRule } from "@/lib/types/protocol";

const storedRuleSchema = z.array(z.object({ id: z.enum(mandatoryProtocolRuleIds), text: z.string().trim().min(1) })).length(mandatoryProtocolRuleIds.length);
const storedTextListSchema = z.array(z.string().trim().min(1));
const storedExpectedOutputTypesSchema = z.array(z.enum(expectedOutputTypes)).min(1);
const storedInputArtifactsSchema = z.array(z.object({ name: z.string().trim().min(1), type: z.string().trim().min(1), description: z.string().nullable().optional() }));
const storedScoringStandardSchema = z.object({ excellent: z.string().trim().min(1), good: z.string().trim().min(1), acceptable: z.string().trim().min(1), poor: z.string().trim().min(1) });

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
        sourceUrls: product.sources.map((source) => source.url),
      })),
      comparability: projectMode === "comparison" ? result.comparability : undefined,
    },
    invariants: {
      testMode: "standardized",
      mandatoryRuleIds: mandatoryProtocolRuleIds,
      rubricWeightTotal: 100,
      protocolMustBeLockedBeforeTesting: true,
    },
  };
  const inputSignature = createInputSignature(inputSnapshot);
  const singleMode = projectMode === "single";

  try {
    const generated = await aiTaskService.generateProtocol({
      schema: generatedProtocolSchema,
      schemaName: "TestProtocol",
      messages: [
        {
          role: "system",
          content: singleMode
            ? "你是严谨但高效的 AI 产品体验设计师。只基于给定 Project Intent 与已保存 ProductResearch，为这一款产品设计可执行、可留证的真实体验方案。目标不是和其他产品比较，而是验证核心能力、用户最关心的场景、官方卖点是否成立，以及可能暴露明显优缺点的任务。默认生成 1–3 个高价值 TestCase，不为覆盖完整而拆出细碎 Case。每个 TestCase 必须声明 expectedOutputTypes 与 evidenceRequirements。Rubric 根据任务动态选择 3–5 个最重要维度，并且每个维度都必须能被当前证据验证。不要引入竞品、排名、胜负或横向比较措辞。不要搜索互联网，不要引用尚未存在的测试结果。输出简体中文。"
            : "你是严谨但高效的 AI 产品实验设计师。只基于给定 Project Intent、已保存 ProductResearch 与 Comparability 设计公平、可执行、可留证的标准化横向测试。默认只生成 2–4 个高价值 TestCase，优先区分度最高的任务，不为覆盖完整而拆出细碎 Case。每个 TestCase 必须声明 expectedOutputTypes 与 evidenceRequirements。Rubric 必须根据任务动态选择 3–5 个最重要维度；不能仅根据文件格式机械套模板，也不能加入当前证据无法验证的维度。只有 Prompt 明确要求的时长、分辨率、音频等规格才可成为评分项。Protocol 中不得出现任何被测产品名称或品牌，以保证后续 Blind Review。不要搜索互联网，不要引用尚未存在的测试结果。输出简体中文。",
        },
        {
          role: "user",
          content: JSON.stringify({
            ...inputSnapshot,
            requirements: {
              preferredTestCaseCount: singleMode ? "1-3 high-value experience cases" : "2-4; simple benchmarks may use 2 and must not pad the count",
              preferredRubricDimensionCount: "3-5 dynamic dimensions",
              preserveMandatoryRuleIdsExactlyOnce: true,
              samePromptAndInputForEveryProductWithinEachCase: !singleMode,
              selfContainedPromptWhenNoInputArtifactWasSupplied: true,
              doNotInventUnavailableFiles: true,
              expectedOutputTypesMustUse: expectedOutputTypes,
              evidenceRequirementsMustDescribeRawEvidenceNeededForReliableJudging: true,
              evidenceMustSupportEverySelectedRubricDimension: true,
              scoringStandardMustDefine: ["excellent", "good", "acceptable", "poor"],
              positionsMustBeContiguousFromOne: true,
              singleProductFocus: singleMode ? ["核心能力", "真实用户场景", "官方卖点验证", "明显优缺点"] : undefined,
            },
          }),
        },
      ],
      maxTokens: 10000,
    });
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
    throw new ProtocolExecutionError(toUserFacingError(error));
  }
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
  if (error instanceof AIValidationError) return "AI 生成结果未通过 Protocol 结构校验，请重新生成。";
  if (error instanceof AIProviderError) return "AI Provider 暂时无法完成 Protocol 生成，请稍后重试。";
  if (error instanceof RepositoryError) return "Protocol 保存或锁定失败，请刷新后重试。";
  return "Protocol 生成失败，请稍后重试。";
}
