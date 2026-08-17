import "server-only";

import { throwRepositoryError } from "@/lib/repositories/repository-error";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { HumanReviewEventRow, ReviewFinalScoreRow, ReviewSessionRow } from "@/lib/types/database";

const reviewSessionColumns = "id, project_id, protocol_id, judge_run_id, status, locked_at, revealed_at, created_at, updated_at";
const reviewEventColumns = "id, event_sequence, score_revision, review_session_id, judge_score_id, action, override_score, reason, target_event_id, actor_id, created_at";
const finalScoreColumns = "review_session_id, judge_score_id, test_case_id, blind_sample_id, rubric_dimension_id, ai_score, final_score, active_override_event_id";

export type RevealedReviewMappingRow = {
  blind_sample_id: string;
  sample_label: string;
  product_id: string;
  product_name: string;
  product_logo_url: string | null;
};

export const humanReviewRepository = {
  async ensure(projectId: string, protocolId: string): Promise<string> {
    const { data, error } = await getSupabaseServerClient().rpc("ensure_review_session", {
      p_project_id: projectId,
      p_protocol_id: protocolId,
    });
    if (error) throwRepositoryError("humanReview.ensure", error);
    return data;
  },

  async getSession(reviewSessionId: string): Promise<ReviewSessionRow> {
    const { data, error } = await getSupabaseServerClient()
      .from("review_sessions")
      .select(reviewSessionColumns)
      .eq("id", reviewSessionId)
      .single();
    if (error) throwRepositoryError("humanReview.getSession", error);
    return data;
  },

  async listEvents(reviewSessionId: string): Promise<HumanReviewEventRow[]> {
    const { data, error } = await getSupabaseServerClient()
      .from("human_review_events")
      .select(reviewEventColumns)
      .eq("review_session_id", reviewSessionId)
      .order("event_sequence", { ascending: true });
    if (error) throwRepositoryError("humanReview.listEvents", error);
    return data;
  },

  async listFinalScores(reviewSessionId: string): Promise<ReviewFinalScoreRow[]> {
    const { data, error } = await getSupabaseServerClient()
      .from("review_final_scores")
      .select(finalScoreColumns)
      .eq("review_session_id", reviewSessionId);
    if (error) throwRepositoryError("humanReview.listFinalScores", error);
    return data;
  },

  async override(projectId: string, reviewSessionId: string, judgeScoreId: string, score: number, reason: string): Promise<string> {
    const { data, error } = await getSupabaseServerClient().rpc("append_human_override", {
      p_review_session_id: reviewSessionId,
      p_judge_score_id: judgeScoreId,
      p_project_id: projectId,
      p_override_score: score,
      p_reason: reason,
    });
    if (error) throwRepositoryError("humanReview.override", error);
    return data;
  },

  async revert(projectId: string, reviewSessionId: string, judgeScoreId: string): Promise<string> {
    const { data, error } = await getSupabaseServerClient().rpc("append_human_revert", {
      p_review_session_id: reviewSessionId,
      p_judge_score_id: judgeScoreId,
      p_project_id: projectId,
    });
    if (error) throwRepositoryError("humanReview.revert", error);
    return data;
  },

  async lock(projectId: string, reviewSessionId: string): Promise<void> {
    const { error } = await getSupabaseServerClient().rpc("lock_review_session", {
      p_project_id: projectId,
      p_review_session_id: reviewSessionId,
    });
    if (error) throwRepositoryError("humanReview.lock", error);
  },

  async reveal(projectId: string, reviewSessionId: string): Promise<void> {
    const { error } = await getSupabaseServerClient().rpc("reveal_review_session", {
      p_project_id: projectId,
      p_review_session_id: reviewSessionId,
    });
    if (error) throwRepositoryError("humanReview.reveal", error);
  },

  async getRevealedMappings(reviewSessionId: string): Promise<RevealedReviewMappingRow[]> {
    const { data, error } = await getSupabaseServerClient().rpc("get_revealed_review_mapping", {
      p_review_session_id: reviewSessionId,
    });
    if (error) throwRepositoryError("humanReview.getRevealedMappings", error);
    return data;
  },
};
