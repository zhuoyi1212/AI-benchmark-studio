import "server-only";

import { memoPageRead } from "@/lib/supabase/read-scope";
import { humanReviewRepository } from "@/lib/repositories/human-review.repository";
import { RepositoryError } from "@/lib/repositories/repository-error";
import { getJudgeReviewWorkspace, type JudgeReviewWorkspace } from "@/lib/services/judge.service";
import type { ReviewStatus } from "@/lib/types/database";

export type HumanReviewScore = {
  judgeScoreId: string;
  testCaseId: string;
  blindSampleId: string;
  rubricDimensionId: string;
  aiScore: number;
  finalScore: number;
  reason: string;
  evidence: string[];
  confidence: number;
  humanOverride: {
    eventId: string;
    score: number;
    reason: string;
    updatedAt: string;
  } | null;
  revisionCount: number;
  reviewFlags: Array<"low_confidence" | "evidence_risk" | "judge_conflict" | "parse_risk" | "fact_risk">;
};

export type HumanReviewWorkspace = Omit<JudgeReviewWorkspace, "latestRun"> & {
  reviewSessionId: string;
  judgeRunId: string;
  status: ReviewStatus;
  lockedAt: string | null;
  revealedAt: string | null;
  scores: HumanReviewScore[];
  summary: { total: number; adjusted: number; accepted: number; auditEvents: number; anomalies: number };
  revealedMappings: Array<{
    sampleId: string;
    sampleLabel: string;
    productId: string;
    productName: string;
    productLogoUrl: string | null;
  }> | null;
};

export class HumanReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HumanReviewError";
  }
}

export async function getHumanReviewWorkspace(projectId: string): Promise<HumanReviewWorkspace | null> {
  return memoPageRead(`human-review:${projectId}`, () => readHumanReviewWorkspace(projectId));
}

async function readHumanReviewWorkspace(projectId: string): Promise<HumanReviewWorkspace | null> {
  const judge = await getJudgeReviewWorkspace(projectId);
  if (!judge?.latestRun || judge.latestRun.status !== "completed") return null;
  try {
    const existingSession = await humanReviewRepository.findByJudgeRun(judge.latestRun.id);
    if (!existingSession) return null;
    const reviewSessionId = existingSession.id;
    const [session, events, finalScores] = await Promise.all([
      humanReviewRepository.getSession(reviewSessionId),
      humanReviewRepository.listEvents(reviewSessionId),
      humanReviewRepository.listFinalScores(reviewSessionId),
    ]);
    if (session.project_id !== projectId || session.protocol_id !== judge.protocolId || session.judge_run_id !== judge.latestRun.id) {
      throw new HumanReviewError("人工复核会话与当前 JudgeRun 不一致。");
    }

    const finalByJudgeScore = new Map(finalScores.map((score) => [score.judge_score_id, score]));
    const eventById = new Map(events.map((event) => [event.id, event]));
    const eventCountByScore = new Map<string, number>();
    for (const event of events) eventCountByScore.set(event.judge_score_id, (eventCountByScore.get(event.judge_score_id) ?? 0) + 1);

    const scores = judge.latestRun.scores.map((score): HumanReviewScore => {
      const finalScore = finalByJudgeScore.get(score.id);
      if (!finalScore) throw new HumanReviewError("Final Score 矩阵不完整。");
      const activeEvent = finalScore.active_override_event_id ? eventById.get(finalScore.active_override_event_id) : null;
      if (finalScore.active_override_event_id && (!activeEvent || activeEvent.action !== "override" || activeEvent.override_score === null || !activeEvent.reason)) {
        throw new HumanReviewError("人工修正审计记录不完整。");
      }
      return {
        judgeScoreId: score.id,
        testCaseId: score.testCaseId,
        blindSampleId: score.blindSampleId,
        rubricDimensionId: score.rubricDimensionId,
        aiScore: score.aiScore,
        finalScore: Number(finalScore.final_score),
        reason: score.reason,
        evidence: score.evidence,
        confidence: score.confidence,
        humanOverride: activeEvent ? {
          eventId: activeEvent.id,
          score: Number(activeEvent.override_score),
          reason: activeEvent.reason!,
          updatedAt: activeEvent.created_at,
        } : null,
        revisionCount: eventCountByScore.get(score.id) ?? 0,
        reviewFlags: identifyReviewFlags(score),
      };
    });
    const adjusted = scores.filter((score) => score.humanOverride !== null).length;
    const revealedMappings = session.status === "revealed"
      ? (await humanReviewRepository.getRevealedMappings(session.id)).map((mapping) => ({
          sampleId: mapping.blind_sample_id,
          sampleLabel: mapping.sample_label,
          productId: mapping.product_id,
          productName: mapping.product_name,
          productLogoUrl: mapping.product_logo_url,
        }))
      : null;
    return {
      projectId: judge.projectId,
      protocolId: judge.protocolId,
      protocolVersion: judge.protocolVersion,
      evaluationMode: judge.evaluationMode,
      samples: judge.samples,
      testCases: judge.testCases,
      rubric: judge.rubric,
      attemptCount: judge.attemptCount,
      reviewSessionId: session.id,
      judgeRunId: session.judge_run_id,
      status: session.status,
      lockedAt: session.locked_at,
      revealedAt: session.revealed_at,
      scores,
      summary: {
        total: scores.length,
        adjusted,
        accepted: scores.length - adjusted,
        auditEvents: events.length,
        anomalies: scores.filter((score) => score.reviewFlags.length > 0).length,
      },
      revealedMappings,
    };
  } catch (error) {
    if (error instanceof HumanReviewError) throw error;
    if (error instanceof RepositoryError) throw new HumanReviewError("人工复核数据暂时无法读取，请刷新后重试。");
    throw error;
  }
}

function identifyReviewFlags(score: JudgeReviewWorkspace["latestRun"] extends infer Run
  ? Run extends { scores: Array<infer Score> } ? Score : never
  : never): HumanReviewScore["reviewFlags"] {
  const flags: HumanReviewScore["reviewFlags"] = [];
  const text = `${score.reason} ${score.evidence.join(" ")}`;
  if (score.confidence < 0.8) flags.push("low_confidence");
  if (score.evidence.length === 0 || /证据不足|缺少.{0,8}证据|无法核验|不可验证/i.test(text)) flags.push("evidence_risk");
  if (/结论冲突|相互矛盾|前后矛盾|inconsistent|conflict/i.test(text)) flags.push("judge_conflict");
  if (/解析失败|无法解析|文件损坏|无法读取|空白文件/i.test(text)) flags.push("parse_risk");
  if (/事实错误|疑似错误|无法确认事实|事实存疑/i.test(text)) flags.push("fact_risk");
  return flags;
}

export async function saveHumanOverride(
  projectId: string,
  reviewSessionId: string,
  judgeScoreId: string,
  score: number,
  reason: string,
): Promise<void> {
  try {
    await humanReviewRepository.override(projectId, reviewSessionId, judgeScoreId, score, reason);
  } catch (error) {
    throwHumanMutationError(error, "人工修正未保存，请刷新后重试。");
  }
}

export async function revertHumanOverride(projectId: string, reviewSessionId: string, judgeScoreId: string): Promise<void> {
  try {
    await humanReviewRepository.revert(projectId, reviewSessionId, judgeScoreId);
  } catch (error) {
    throwHumanMutationError(error, "当前评分没有可恢复的人工修正。");
  }
}

export async function lockHumanReview(projectId: string, reviewSessionId: string): Promise<void> {
  try {
    await humanReviewRepository.lock(projectId, reviewSessionId);
  } catch (error) {
    throwHumanMutationError(error, "最终评分未能锁定，请刷新后重试。");
  }
}

export async function revealHumanReview(projectId: string, reviewSessionId: string): Promise<void> {
  try {
    await humanReviewRepository.reveal(projectId, reviewSessionId);
  } catch (error) {
    throwHumanMutationError(error, "只有锁定最终评分后才能揭晓产品身份。");
  }
}

function throwHumanMutationError(error: unknown, message: string): never {
  if (error instanceof HumanReviewError) throw error;
  if (error instanceof RepositoryError) throw new HumanReviewError(message);
  throw error;
}
