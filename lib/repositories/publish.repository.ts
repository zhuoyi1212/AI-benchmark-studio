import "server-only";

import type { CommunityPostOutput, ContentIdea, PublishConfig, SelectedContentIdea, titleRefreshAuditSchema } from "@/lib/ai/schemas/publish.schemas";
import type { z } from "zod";
import type { AITaskRoute, AIUsage } from "@/lib/ai/types";
import { throwRepositoryError } from "@/lib/repositories/repository-error";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Json, PublishPackArtifactRow, PublishPackRow } from "@/lib/types/database";

const packColumns = "id, project_id, report_id, findings_id, version, status, config, content_ideas, selected_idea, community_post, model, provider, prompt_version, input_signature, error_message, created_at, updated_at, completed_at, input_tokens, output_tokens, latency_ms, estimated_cost, discovery_provider, discovery_model, discovery_prompt_version, discovery_input_signature, discovery_input_tokens, discovery_output_tokens, discovery_latency_ms, discovery_estimated_cost, discovery_started_at, discovered_at, generation_started_at";
const artifactColumns = "publish_pack_id, artifact_id, display_order, reason, supports_claim, supports_paragraph, created_at";

export const publishRepository = {
  async createRevision(projectId: string, sourcePackId: string, mode: 'manual' | 'regenerate', copy: Json = {}, recommendations: Json = []): Promise<string> {
    const { data, error } = await getSupabaseServerClient().rpc('create_publish_revision', {
      p_project_id: projectId, p_source_pack_id: sourcePackId, p_mode: mode,
      p_copy: copy, p_recommendations: recommendations,
    });
    if (error) throwRepositoryError('publish.createRevision', error);
    return data;
  },
  async beginFromReport(projectId: string, reportId: string): Promise<string> {
    const { data, error } = await getSupabaseServerClient().rpc("begin_publish_pack", { p_project_id: projectId, p_report_id: reportId });
    if (error) throwRepositoryError("publish.beginFromReport", error);
    return data;
  },
  async beginFromFindings(projectId: string, findingsId: string): Promise<string> {
    const { data, error } = await getSupabaseServerClient().rpc("begin_findings_publish_pack", { p_project_id: projectId, p_findings_id: findingsId });
    if (error) throwRepositoryError("publish.beginFromFindings", error);
    return data;
  },
  async startDiscovery(packId: string, route: AITaskRoute, inputSignature: string): Promise<void> {
    const { error } = await getSupabaseServerClient().rpc("start_content_discovery", {
      p_publish_pack_id: packId, p_provider: route.provider, p_model: route.model,
      p_prompt_version: route.promptVersion, p_input_signature: inputSignature,
    });
    if (error) throwRepositoryError("publish.startDiscovery", error);
  },
  async completeDiscovery(packId: string, ideas: ContentIdea[], usage: AIUsage): Promise<void> {
    const { error } = await getSupabaseServerClient().rpc("complete_content_discovery", {
      p_publish_pack_id: packId, p_content_ideas: ideas as unknown as Json, p_usage: usage as unknown as Json,
    });
    if (error) throwRepositoryError("publish.completeDiscovery", error);
  },
  async startPost(packId: string, selectedIdea: SelectedContentIdea, config: PublishConfig, route: AITaskRoute, inputSignature: string): Promise<void> {
    const { error } = await getSupabaseServerClient().rpc("start_community_post", {
      p_publish_pack_id: packId, p_selected_idea: selectedIdea as unknown as Json, p_config: config as unknown as Json,
      p_provider: route.provider, p_model: route.model, p_prompt_version: route.promptVersion, p_input_signature: inputSignature,
    });
    if (error) throwRepositoryError("publish.startPost", error);
  },
  async complete(packId: string, post: CommunityPostOutput, usage: AIUsage): Promise<void> {
    const { error } = await getSupabaseServerClient().rpc("complete_publish_pack", {
      p_publish_pack_id: packId,
      p_community_post: {
        title: post.title,
        body: post.body,
        tags: post.tags,
        interactionQuestion: post.interactionQuestion,
        ...(post.storyBrief ? { storyBrief: post.storyBrief } : {}),
        ...(post.draftReview ? { draftReview: post.draftReview } : {}),
        ...(post.contentBrief ? { contentBrief: post.contentBrief } : {}),
        ...(post.languagePass ? { languagePass: post.languagePass } : {}),
        ...(post.writingPlan ? { writingPlan: post.writingPlan } : {}),
        ...(post.contentPolicyVersion ? { contentPolicyVersion: post.contentPolicyVersion } : {}),
        ...(post.editorialPlan ? { editorialPlan: post.editorialPlan } : {}),
        ...(post.factCheck ? { factCheck: post.factCheck } : {}),
        ...(post.articleReview ? { articleReview: post.articleReview } : {}),
        ...(post.generationTrace ? { generationTrace: post.generationTrace } : {}),
        ...(post.stylePreservation ? { stylePreservation: post.stylePreservation } : {}),
        ...(post.styleEdit ? { styleEdit: post.styleEdit } : {}),
      } as unknown as Json,
      p_recommendations: post.screenshotRecommendations as unknown as Json,
      p_usage: usage as unknown as Json,
    });
    if (error) throwRepositoryError("publish.complete", error);
  },
  async refreshTitle(
    sourcePackId: string,
    title: string,
    audit: z.infer<typeof titleRefreshAuditSchema>,
    route: AITaskRoute,
    inputSignature: string,
    usage: AIUsage,
  ): Promise<string> {
    const { data, error } = await getSupabaseServerClient().rpc("refresh_publish_pack_title", {
      p_source_publish_pack_id: sourcePackId,
      p_title: title,
      p_title_refresh: audit as unknown as Json,
      p_provider: route.provider,
      p_model: route.model,
      p_prompt_version: route.promptVersion,
      p_input_signature: inputSignature,
      p_usage: usage as unknown as Json,
    });
    if (error) throwRepositoryError("publish.refreshTitle", error);
    return data;
  },
  async fail(packId: string, errorMessage: string): Promise<void> {
    const { error } = await getSupabaseServerClient().rpc("fail_publish_pack", { p_publish_pack_id: packId, p_error_message: errorMessage });
    if (error) throwRepositoryError("publish.fail", error);
  },
  async listByReport(reportId: string, limit?: number): Promise<PublishPackRow[]> {
    const query = getSupabaseServerClient().from("publish_packs").select(packColumns).eq("report_id", reportId).order("version", { ascending: false });
    const { data, error } = await (limit === undefined ? query : query.limit(limit));
    if (error) throwRepositoryError("publish.listByReport", error);
    return data;
  },
  async listByFindings(findingsId: string, limit?: number): Promise<PublishPackRow[]> {
    const query = getSupabaseServerClient().from("publish_packs").select(packColumns).eq("findings_id", findingsId).order("version", { ascending: false });
    const { data, error } = await (limit === undefined ? query : query.limit(limit));
    if (error) throwRepositoryError("publish.listByFindings", error);
    return data;
  },
  async listArtifacts(packId: string): Promise<PublishPackArtifactRow[]> {
    const { data, error } = await getSupabaseServerClient().from("publish_pack_artifacts").select(artifactColumns).eq("publish_pack_id", packId).order("display_order", { ascending: true });
    if (error) throwRepositoryError("publish.listArtifacts", error);
    return data;
  },
};
