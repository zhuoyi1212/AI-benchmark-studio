import "server-only";

import { RepositoryError } from "@/lib/repositories/repository-error";
import { blindReviewRepository } from "@/lib/repositories/blind-review.repository";
import { getProtocolWorkspace } from "@/lib/services/protocols.service";
import { SupabaseRequestTimeoutError, withSupabaseRequestTimeout } from "@/lib/supabase/server";
import type { BlindSample } from "@/lib/types/review";
import type { EvaluationMode } from "@/lib/project-mode";

export type BlindReviewWorkspace = {
  projectId: string;
  protocolId: string;
  protocolVersion: number;
  evaluationMode: EvaluationMode;
  samples: BlindSample[];
  testCases: Array<{ id: string; position: number; title: string }>;
};

export class BlindReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlindReviewError";
  }
}

const workspaceQueryTimeoutMs = 45_000;
const blindReviewRpcTimeoutMs = 15_000;

export async function startProfessionalReview(
  projectId: string,
  expectedProtocolId?: string,
): Promise<{ protocolId: string; blindSampleCount: number }> {
  const protocolWorkspace = await runSupabaseStep("workspace query", workspaceQueryTimeoutMs, () =>
    getProtocolWorkspace(projectId),
  );
  const protocol = protocolWorkspace?.protocol;
  if (!protocolWorkspace || !protocol || protocol.status !== "locked"
    || (expectedProtocolId && protocol.id !== expectedProtocolId)) {
    throw new BlindReviewError("只能从当前锁定的测试计划启动专业评分。");
  }

  try {
    await runSupabaseStep("assert_blind_protocol_safe", blindReviewRpcTimeoutMs, () =>
      blindReviewRepository.assertProtocolSafe(projectId, protocol.id),
    );
    await runSupabaseStep("start_professional_review", blindReviewRpcTimeoutMs, () =>
      blindReviewRepository.startProfessional(projectId, protocol.id),
    );
    const samples = await runSupabaseStep("Blind Sample verification", blindReviewRpcTimeoutMs, () =>
      blindReviewRepository.listSamples(protocol.id),
    );
    if (samples.length === 0) throw new BlindReviewError("Professional Review started without creating Blind Samples.");
    return { protocolId: protocol.id, blindSampleCount: samples.length };
  } catch (error) {
    if (error instanceof RepositoryError) {
      throw new BlindReviewError("专业评分启动失败，请确认全部真实测试结果已经完成。");
    }
    throw error;
  }
}

async function runSupabaseStep<T>(name: string, timeoutMs: number, run: () => Promise<T>): Promise<T> {
  const startedAt = performance.now();
  console.info(`[Professional Review] ${name} → 开始`);
  try {
    const result = await withSupabaseRequestTimeout(name, timeoutMs, run);
    console.info(`[Professional Review] ${name} → 成功 + ${Math.round(performance.now() - startedAt)} ms`);
    return result;
  } catch (error) {
    const elapsedMs = Math.round(performance.now() - startedAt);
    const outcome = error instanceof SupabaseRequestTimeoutError ? "超时" : "失败";
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`[Professional Review] ${name} → ${outcome} + ${elapsedMs} ms: ${reason}`);
    throw error;
  }
}

export async function getBlindReviewWorkspace(projectId: string): Promise<BlindReviewWorkspace | null> {
  const protocolWorkspace = await getProtocolWorkspace(projectId);
  const protocol = protocolWorkspace?.protocol;
  if (!protocolWorkspace || !protocol || protocol.status !== "locked") return null;
  try {
    await blindReviewRepository.assertProtocolSafe(projectId, protocol.id);
    const samples = await blindReviewRepository.listSamples(protocol.id);
    if (samples.length === 0) throw new BlindReviewError("Blind Samples 尚未建立。");
    return {
      projectId,
      protocolId: protocol.id,
      protocolVersion: protocol.version,
      evaluationMode: protocolWorkspace.research.project.evaluationMode,
      samples: samples.map((sample) => ({ sampleId: sample.id, label: sample.label })),
      testCases: protocol.testCases.map((testCase, index) => ({ id: testCase.id, position: index + 1, title: testCase.title })),
    };
  } catch (error) {
    if (error instanceof RepositoryError) {
      throw new BlindReviewError("Blind Review 只能在全部原始测试结果确认后开始。");
    }
    throw error;
  }
}
