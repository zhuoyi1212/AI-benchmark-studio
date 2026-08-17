import "server-only";

import { throwRepositoryError } from "@/lib/repositories/repository-error";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { BlindSampleRow } from "@/lib/types/database";

const blindSampleColumns = "id, protocol_id, label, created_at";

export const blindReviewRepository = {
  async assertProtocolSafe(projectId: string, protocolId: string): Promise<void> {
    const { error } = await getSupabaseServerClient().rpc("assert_blind_protocol_safe", {
      p_project_id: projectId,
      p_protocol_id: protocolId,
    });
    if (error) throwRepositoryError("blindReview.assertProtocolSafe", error);
  },

  async initialize(projectId: string, protocolId: string): Promise<void> {
    const { error } = await getSupabaseServerClient().rpc("initialize_blind_layer", {
      p_project_id: projectId,
      p_protocol_id: protocolId,
    });
    if (error) throwRepositoryError("blindReview.initialize", error);
  },

  async listSamples(protocolId: string): Promise<BlindSampleRow[]> {
    const { data, error } = await getSupabaseServerClient()
      .from("blind_samples")
      .select(blindSampleColumns)
      .eq("protocol_id", protocolId)
      .order("label", { ascending: true });
    if (error) throwRepositoryError("blindReview.listSamples", error);
    return data;
  },
};
