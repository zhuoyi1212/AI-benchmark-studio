import "server-only";
import { z } from "zod";

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
  kind: "image" | "pdf" | "text" | "video" | "document";
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  metadata: Json;
};

export type StoredArtifactInfo = {
  size: number;
  contentType: string;
  etag: string | null;
};

export const testExecutionRepository = {
  async removeArtifact(projectId: string, protocolId: string, artifactId: string) {
    const { data, error } = await getSupabaseServerClient().rpc("remove_test_artifact", {
      p_project_id: projectId, p_protocol_id: protocolId, p_artifact_id: artifactId,
    });
    if (error) throwRepositoryError("testExecution.removeArtifact", error);
    return z.object({ protocolId: z.string().uuid(), storagePaths: z.array(z.string()), cacheArtifactIds: z.array(z.string().uuid()) }).parse(data);
  },
  async removeMediaCache(artifactId: string): Promise<void> {
    const storage = getSupabaseServerClient().storage.from(artifactBucket);
    async function removePrefix(prefix: string): Promise<void> {
      // Remove a page before listing again so pagination cannot skip deleted keys.
      for (;;) {
        const { data, error } = await storage.list(prefix, { limit: 100 });
        if (error) throwRepositoryError("testExecution.listMediaCache", error);
        if (!data.length) return;
        const files: string[] = [];
        for (const item of data) {
          const path = `${prefix}/${item.name}`;
          if (item.id) files.push(path);
          else await removePrefix(path);
        }
        if (files.length) {
          const { error: removeError } = await storage.remove(files);
          if (removeError) throwRepositoryError("testExecution.removeMediaCache", removeError);
        }
      }
    }
    await removePrefix(`media-cache/${artifactId}`);
  },
  async finishDeletion(projectId: string, artifactId: string): Promise<void> {
    const { error } = await getSupabaseServerClient().rpc("finish_test_artifact_deletion", { p_project_id: projectId, p_artifact_id: artifactId });
    if (error) throwRepositoryError("testExecution.finishDeletion", error);
  },
  async pendingDeletions(projectId: string) {
    const { data, error } = await getSupabaseServerClient().rpc("pending_test_artifact_deletions", { p_project_id: projectId });
    if (error) throwRepositoryError("testExecution.pendingDeletions", error);
    return z.array(z.object({ artifactId: z.string().uuid(), protocolId: z.string().uuid(), fileName: z.string() })).parse(data);
  },
  async restart(projectId: string, protocolId: string): Promise<string> {
    const { data, error } = await getSupabaseServerClient().rpc("restart_test_execution", {
      p_project_id: projectId, p_protocol_id: protocolId,
    });
    if (error) throwRepositoryError("testExecution.restart", error);
    return data;
  },
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
      .from("available_test_artifacts")
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

  async createSignedUpload(path: string): Promise<{ signedUrl: string }> {
    const { data, error } = await getSupabaseServerClient().storage
      .from(artifactBucket)
      .createSignedUploadUrl(path, { upsert: false });
    if (error) throwRepositoryError("testExecution.createSignedUpload", error);
    return { signedUrl: data.signedUrl };
  },

  async getStorageObjectInfo(path: string): Promise<StoredArtifactInfo> {
    const { data, error } = await getSupabaseServerClient().storage.from(artifactBucket).info(path);
    if (error) throwRepositoryError("testExecution.getStorageObjectInfo", error);
    if (typeof data.size !== "number" || !data.contentType) {
      throwRepositoryError("testExecution.getStorageObjectInfo", { message: "Storage object metadata is incomplete" });
    }
    return { size: data.size, contentType: data.contentType.toLowerCase(), etag: data.etag ?? null };
  },

  async readStorageObject(path: string, maximumBytes: number): Promise<Uint8Array> {
    const { data, error } = await getSupabaseServerClient().storage.from(artifactBucket).download(path);
    if (error) throwRepositoryError("testExecution.readStorageObject", error);
    if (data.size > maximumBytes) {
      throwRepositoryError("testExecution.readStorageObject", { message: "Storage object exceeds verification limit" });
    }
    return new Uint8Array(await data.arrayBuffer());
  },

  async readStorageObjectPrefix(path: string, byteCount: number): Promise<Uint8Array> {
    const { data, error } = await getSupabaseServerClient().storage.from(artifactBucket).createSignedUrl(path, 60);
    if (error) throwRepositoryError("testExecution.readStorageObjectPrefix", error);
    const response = await fetch(data.signedUrl, {
      headers: { Range: `bytes=0-${byteCount - 1}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throwRepositoryError("testExecution.readStorageObjectPrefix", { message: `Storage range read failed (${response.status})` });
    }
    const reader = response.body?.getReader();
    if (!reader) return new Uint8Array();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (length < byteCount) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = byteCount - length;
      const chunk = value.slice(0, remaining);
      chunks.push(chunk);
      length += chunk.length;
      if (chunk.length < value.length || length >= byteCount) {
        await reader.cancel();
        break;
      }
    }
    const output = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
    return output;
  },

  async removeStorageObject(path: string): Promise<void> {
    const { error } = await getSupabaseServerClient().storage.from(artifactBucket).remove([path]);
    if (error) throwRepositoryError("testExecution.removeStorageObject", error);
  },

  async createSignedUrl(path: string): Promise<string> {
    let lastError: { code?: string; message: string } | null = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const { data, error } = await getSupabaseServerClient().storage.from(artifactBucket).createSignedUrl(path, 3600);
      if (!error) return data.signedUrl;
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
    throwRepositoryError("testExecution.createSignedUrl", lastError ?? { message: "Unknown Storage error" });
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

  async findArtifactByStoragePath(path: string, testRunId: string): Promise<TestArtifactRow | null> {
    const { data, error } = await getSupabaseServerClient()
      .from("available_test_artifacts")
      .select(artifactColumns)
      .eq("storage_path", path)
      .eq("test_run_id", testRunId)
      .maybeSingle();
    if (error) throwRepositoryError("testExecution.findArtifactByStoragePath", error);
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
