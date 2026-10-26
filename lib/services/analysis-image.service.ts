import "server-only";
import { analysisImagePaths, analysisImagePolicyVersion, analysisImageSchema, AnalysisImageError, digest, maxAnalysisImageBytes, prepareAnalysisImage } from "@/lib/media/analysis-image";
import { testExecutionRepository } from "@/lib/repositories/test-execution.repository";
import type { Json } from "@/lib/types/database";

/** Called after direct upload, before recording the immutable Artifact. */
export async function storeAnalysisImage(sourcePath: string, bytes: Uint8Array, mimeType: string) {
  const prepared = await prepareAnalysisImage(bytes, mimeType);
  const path = prepared.manifest.encoding === "original" ? sourcePath : analysisImagePaths(sourcePath)[prepared.manifest.mimeType === "image/png" ? 0 : 1];
  if (!path) throw new AnalysisImageError("图片存储路径无效，请重新上传。");
  if (path !== sourcePath) {
    try { await testExecutionRepository.uploadStorageObject(path, prepared.bytes, prepared.manifest.mimeType); }
    catch (error) {
      // Concurrent/lost-response confirmations may already have created the same immutable copy.
      const stored = await testExecutionRepository.readStorageObject(path, maxAnalysisImageBytes).catch(() => { throw error; });
      if (stored.length !== prepared.manifest.sizeBytes || digest(stored) !== prepared.manifest.sha256) throw error;
    }
  }
  return { ...prepared.manifest, storagePath: path };
}

/** Legacy images are adapted on explicit analysis, without modifying historical rows. */
export async function imageForAI(input: { id: string; fileUrl: string; fileType: string; sizeBytes: number; sha256?: string }) {
  const row = await testExecutionRepository.findArtifactById(input.id);
  if (!row || row.kind !== "image" || row.mime_type !== input.fileType || row.size_bytes !== input.sizeBytes || (input.sha256 && input.sha256 !== row.sha256)) {
    throw new AnalysisImageError("图片已移除或来源发生变化，请刷新后重试分析。");
  }
  const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {};
  const cached = analysisImageSchema.safeParse(metadata.analysisImage);
  let bytes: Uint8Array;
  let manifest: Omit<ReturnType<typeof analysisImageSchema.parse>, "storagePath">;
  if (cached.success && cached.data.sourceSha256 === row.sha256 && [row.storage_path, ...analysisImagePaths(row.storage_path)].includes(cached.data.storagePath)) {
    try {
      bytes = await testExecutionRepository.readStorageObject(cached.data.storagePath, maxAnalysisImageBytes);
      if (bytes.length !== cached.data.sizeBytes || digest(bytes) !== cached.data.sha256) throw new Error("integrity");
      manifest = cached.data;
    } catch {
      // Rebuild a missing technical copy from verified raw bytes; never substitute evidence.
      const prepared = await readAndPrepare(row.storage_path, row.size_bytes, row.sha256, row.mime_type);
      bytes = prepared.bytes; manifest = prepared.manifest;
    }
  } else {
    const prepared = await readAndPrepare(row.storage_path, row.size_bytes, row.sha256, row.mime_type);
    bytes = prepared.bytes; manifest = prepared.manifest;
  }
  return {
    url: `data:${manifest.mimeType};base64,${Buffer.from(bytes).toString("base64")}`,
    description: `Image transport: ${JSON.stringify({ ...manifest, storagePath: undefined })}. This is a technical analysis copy of the supplied original Artifact, not a new test output. Compression/size changes are transport processing, not product behaviour. Unclear small text or fine details must remain unknown.`,
  };
}

async function readAndPrepare(path: string, size: number, sha256: string | null, mimeType: string) {
  const bytes = await testExecutionRepository.readStorageObject(path, 50 * 1024 * 1024);
  if (bytes.length !== size || !sha256 || digest(bytes) !== sha256) throw new AnalysisImageError("原始图片完整性校验失败，请检查文件后重试。");
  return prepareAnalysisImage(bytes, mimeType);
}

export function analysisImageMetadata(value: Awaited<ReturnType<typeof storeAnalysisImage>>): Json {
  return analysisImageSchema.parse({ ...value, policyVersion: analysisImagePolicyVersion });
}
