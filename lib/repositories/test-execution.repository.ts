import "server-only";

import { throwRepositoryError } from "@/lib/repositories/repository-error";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Json, TestArtifactRow, TestRunRow } from "@/lib/types/database";

const artifactBucket = "benchmark-artifacts";
const testRunColumns = "id, project_id, protocol_id, test_case_id, product_id, status, generation_time_seconds, retry_count, manually_edited, notes, created_at, updated_at";
const artifactColumns = "id, test_run_id, kind, bucket_id, storage_path, file_name, mime_type, size_bytes, preview_path, sha256, metadata, created_at";

export type RunExecutionMetadata = {
  generationTimeSeconds: number | null;
  retryCount: number;
  manuallyEdited: boolean;
  notes: string | null;
};

export type ArtifactRecord = {
  id: string;
  kind: "image" | "pdf" | "text" | "video";
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  metadata: Json;
};

export const testExecutionRepository = {
  async ensureMatrix(projectId: string, protocolId: string): Promise<void> {
    const { error } = await getSupabaseServerClient().rpc("ensure_test_run_matrix", {
      p_project_id: projectId,
      p_protocol_id: protocolId,
    });
    if (error) throwRepositoryError("testExecution.ensureMatrix", error);
  },

  async listRuns(protocolId: string): Promise<TestRunRow[]> {
    const { data, error } = await getSupabaseServerClient()
      .from("test_runs")
      .select(testRunColumns)
      .eq("protocol_id", protocolId)
      .order("created_at", { ascending: true });
    if (error) throwRepositoryError("testExecution.listRuns", error);
    return data;
  },

  async findRun(testRunId: string): Promise<TestRunRow | null> {
    const { data, error } = await getSupabaseServerClient()
      .from("test_runs")
      .select(testRunColumns)
      .eq("id", testRunId)
      .maybeSingle();
    if (error) throwRepositoryError("testExecution.findRun", error);
    return data;
  },

  async listArtifacts(testRunIds: string[]): Promise<TestArtifactRow[]> {
    if (testRunIds.length === 0) return [];
    const { data, error } = await getSupabaseServerClient()
      .from("test_artifacts")
      .select(artifactColumns)
      .in("test_run_id", testRunIds)
      .order("created_at", { ascending: true });
    if (error) throwRepositoryError("testExecution.listArtifacts", error);
    return data;
  },

  async uploadStorageObject(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const { error } = await getSupabaseServerClient().storage
      .from(artifactBucket)
      .upload(path, bytes, { contentType, upsert: false });
    if (error) throwRepositoryError("testExecution.uploadStorageObject", error);
  },

  async removeStorageObject(path: string): Promise<void> {
    const { error } = await getSupabaseServerClient().storage.from(artifactBucket).remove([path]);
    if (error) throwRepositoryError("testExecution.removeStorageObject", error);
  },

  async createSignedUrl(path: string): Promise<string> {
    const { data, error } = await getSupabaseServerClient().storage.from(artifactBucket).createSignedUrl(path, 3600);
    if (error) throwRepositoryError("testExecution.createSignedUrl", error);
    return data.signedUrl;
  },

  async recordArtifact(testRunId: string, artifact: ArtifactRecord, metadata: RunExecutionMetadata): Promise<string> {
    const { data, error } = await getSupabaseServerClient().rpc("record_test_artifact", {
      p_test_run_id: testRunId,
      p_artifact: artifact as unknown as Json,
      p_run_metadata: metadata as unknown as Json,
    });
    if (error) throwRepositoryError("testExecution.recordArtifact", error);
    return data;
  },

  async finalize(projectId: string, protocolId: string): Promise<void> {
    const { error } = await getSupabaseServerClient().rpc("finalize_test_execution", {
      p_project_id: projectId,
      p_protocol_id: protocolId,
    });
    if (error) throwRepositoryError("testExecution.finalize", error);
  },
};
