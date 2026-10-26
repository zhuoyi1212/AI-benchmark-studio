import "server-only";
import { storeAnalysisImage, analysisImageMetadata } from "@/lib/services/analysis-image.service";
import { AnalysisImageError } from "@/lib/media/analysis-image";
import { memoPageRead } from "@/lib/supabase/read-scope";
import { getProjectSummary } from "@/lib/services/projects.service";
import { getLockedProtocolContext } from "@/lib/services/protocols.service";

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { RepositoryError } from "@/lib/repositories/repository-error";
import { projectsRepository } from "@/lib/repositories/projects.repository";
import { protocolsRepository } from "@/lib/repositories/protocols.repository";
import {
  testExecutionRepository,
  type RunExecutionMetadata,
} from "@/lib/repositories/test-execution.repository";
import type { Json, TestArtifactRow, TestRunRow } from "@/lib/types/database";
import type { PreparedArtifactUpload, TestArtifact, TestExecutionWorkspace, TestRun } from "@/lib/types/test-run";

const maxArtifactBytes = 50 * 1024 * 1024;
const maxTextArtifactBytes = 500_000;
const mimeTypeByExtension: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  json: "application/json",
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  doc: "application/msword",
  xls: "application/vnd.ms-excel",
  ppt: "application/vnd.ms-powerpoint",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};
const executionMetadataSchema = z.object({
  generationTimeSeconds: z.number().int().min(0).max(86400).nullable(),
  retryCount: z.number().int().min(0).max(20),
  manuallyEdited: z.boolean(),
  notes: z.string().trim().max(2000).nullable(),
});
const artifactIdSchema = z.string().uuid();
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

export type ArtifactFileDescriptor = {
  name: string;
  size: number;
  type: string;
  lastModified: number | null;
};

type SupportedArtifact = {
  kind: "image" | "pdf" | "text" | "video" | "document";
  mimeType: string;
  extension: string;
};

const supportedArtifacts: Record<string, SupportedArtifact> = {
  "image/png": { kind: "image", mimeType: "image/png", extension: "png" },
  "image/jpeg": { kind: "image", mimeType: "image/jpeg", extension: "jpg" },
  "image/webp": { kind: "image", mimeType: "image/webp", extension: "webp" },
  "application/pdf": { kind: "pdf", mimeType: "application/pdf", extension: "pdf" },
  "text/plain": { kind: "text", mimeType: "text/plain", extension: "txt" },
  "text/markdown": { kind: "text", mimeType: "text/markdown", extension: "md" },
  "application/json": { kind: "text", mimeType: "application/json", extension: "json" },
  "text/csv": { kind: "text", mimeType: "text/csv", extension: "csv" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { kind: "document", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extension: "docx" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { kind: "document", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { kind: "document", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", extension: "pptx" },
  "application/msword": { kind: "document", mimeType: "application/msword", extension: "doc" },
  "application/vnd.ms-excel": { kind: "document", mimeType: "application/vnd.ms-excel", extension: "xls" },
  "application/vnd.ms-powerpoint": { kind: "document", mimeType: "application/vnd.ms-powerpoint", extension: "ppt" },
  "video/mp4": { kind: "video", mimeType: "video/mp4", extension: "mp4" },
  "video/webm": { kind: "video", mimeType: "video/webm", extension: "webm" },
  "video/quicktime": { kind: "video", mimeType: "video/quicktime", extension: "mov" },
};

export class TestExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TestExecutionError";
  }
}

export async function removeTestArtifact(projectId: string, protocolId: string, artifactId: string): Promise<void> {
  if (![projectId, protocolId, artifactId].every(id => artifactIdSchema.safeParse(id).success)) {
    throw new TestExecutionError("文件标识无效，请刷新后重试。");
  }
  let removal: { protocolId: string; storagePaths: string[]; cacheArtifactIds: string[] };
  try { removal = await testExecutionRepository.removeArtifact(projectId, protocolId, artifactId); }
  catch (error) {
    if (error instanceof RepositoryError) {
      if (error.code === 'P2101') throw new TestExecutionError("测试版本已变化，请刷新后重试。");
      if (error.code === 'P2102') throw new TestExecutionError("后台仍在分析或生成内容，请结束后再删除。");
      if (error.code === 'P2103') throw new TestExecutionError("文件已不存在，请刷新页面。");
    }
    throw new TestExecutionError("删除失败，请重试。");
  }
  try {
    for (const id of removal.cacheArtifactIds) await testExecutionRepository.removeMediaCache(id);
    for (const path of new Set(removal.storagePaths)) await testExecutionRepository.removeStorageObject(path);
    await testExecutionRepository.finishDeletion(projectId, artifactId);
  } catch {
    throw new TestExecutionError("文件已移出分析，存储清理未完成，请重试删除。");
  }
}

export async function restartTestExecution(projectId: string, protocolId: string): Promise<string> {
  if (!artifactIdSchema.safeParse(projectId).success || !artifactIdSchema.safeParse(protocolId).success) {
    throw new TestExecutionError("项目或测试版本无效，请刷新后重试。");
  }
  try { return await testExecutionRepository.restart(projectId, protocolId); }
  catch (error) {
    if (error instanceof RepositoryError) {
      if (error.code === 'P2101') throw new TestExecutionError("测试版本已变化，请刷新后重试。");
      if (error.code === 'P2102') throw new TestExecutionError("后台仍在分析或生成内容，请结束后再重新上传。");
      if (error.code === 'P2103') throw new TestExecutionError("当前没有需要移除的已上传文件。");
    }
    throw new TestExecutionError("未能开始重新上传，原文件和分析已保留，请重试。");
  }
}

// Submission only needs the current protocol and persisted evidence. Avoid rebuilding
// the research workspace and signing every download URL just to enqueue evaluation.
export async function getTestExecutionReadiness(projectId: string) {
  const [project, protocols] = await Promise.all([
    projectsRepository.findActiveById(projectId),
    protocolsRepository.listByProject(projectId),
  ]);
  const protocol = protocols[0];
  if (!project || !protocol || protocol.status !== "locked") return null;
  const runs = await testExecutionRepository.listRuns(protocol.id);
  const artifacts = runs.length ? await testExecutionRepository.listArtifacts(runs.map(run => run.id)) : [];
  const uploadedRunIds = new Set(artifacts.map(artifact => artifact.test_run_id));
  return {
    evaluationMode: project.evaluation_mode,
    protocolId: protocol.id,
    complete: runs.length > 0 && runs.every(run => uploadedRunIds.has(run.id)),
  };
}

export async function getTestExecutionWorkspace(projectId: string): Promise<TestExecutionWorkspace | null> {
  return memoPageRead(`test:${projectId}`, () => readTestExecutionWorkspace(projectId));
}

async function readTestExecutionWorkspace(projectId: string): Promise<TestExecutionWorkspace | null> {
  const [context, project] = await Promise.all([getLockedProtocolContext(projectId), getProjectSummary(projectId)]);
  const protocol = context?.protocol;
  if (!context || !project || !protocol) return null;

  try {
    const rows = await testExecutionRepository.listRuns(protocol.id);
    if (rows.length === 0) return null;
    const artifacts = await testExecutionRepository.listArtifacts(rows.map((row) => row.id));
    const artifactsByRun = Map.groupBy(artifacts, (artifact) => artifact.test_run_id);
    const [mappedRuns, pendingDeletions] = await Promise.all([
      Promise.all(rows.map((row) => mapTestRun(row, artifactsByRun.get(row.id) ?? []))),
      testExecutionRepository.pendingDeletions(projectId),
    ]);
    return {
      project: {
        id: project.id,
        name: project.name,
        evaluationMode: project.evaluationMode,
        products: project.products.map(({ id, name, initials }) => ({ id, name, initials })),
      },
      protocol,
      testRuns: mappedRuns,
      pendingDeletions,
    };
  } catch (error) {
    throw new TestExecutionError(toUserFacingError(error));
  }
}

export async function uploadTestArtifact(input: {
  projectId: string;
  testRunId: string;
  file: File;
  metadata: RunExecutionMetadata;
}): Promise<string> {
  const metadata = executionMetadataSchema.parse(input.metadata);
  const run = await findOpenRun(input.projectId, input.testRunId);

  const file = normalizeAndValidateFile(input.file);
  const bytes = new Uint8Array(await file.file.arrayBuffer());
  validateFileSignature(bytes, file.mimeType);
  const artifactType = supportedArtifacts[file.mimeType]!;
  const artifactId = randomUUID();
  const storagePath = `projects/${run.project_id}/runs/${run.id}/${artifactId}.${artifactType.extension}`;
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  try {
    await testExecutionRepository.uploadStorageObject(storagePath, bytes, artifactType.mimeType);
    try {
      const analysisImage = artifactType.kind === "image"
        ? analysisImageMetadata(await storeAnalysisImage(storagePath, bytes, artifactType.mimeType)) : undefined;
      return await testExecutionRepository.recordArtifact(run.id, {
        id: artifactId,
        kind: artifactType.kind,
        storagePath,
        fileName: file.file.name.trim(),
        mimeType: artifactType.mimeType,
        sizeBytes: file.file.size,
        sha256,
        metadata: {
          originalLastModified: file.file.lastModified || null,
          capturedAs: "raw_test_output",
          ...(analysisImage ? { analysisImage } : {}),
        } satisfies Json,
      }, metadata);
    } catch (error) {
      try { await testExecutionRepository.removeStorageObject(storagePath); } catch { /* Preserve original persistence error. */ }
      throw error;
    }
  } catch (error) {
    if (error instanceof TestExecutionError) throw error;
    if (error instanceof AnalysisImageError) throw new TestExecutionError(error.message);
    throw new TestExecutionError(toUserFacingError(error));
  }
}

export async function prepareTestArtifactUpload(input: {
  projectId: string;
  testRunId: string;
  file: ArtifactFileDescriptor;
}): Promise<PreparedArtifactUpload> {
  const run = await findOpenRun(input.projectId, input.testRunId);
  const file = normalizeAndValidateFileDescriptor(input.file);
  const artifactType = supportedArtifacts[file.mimeType]!;
  const artifactId = randomUUID();
  const storagePath = artifactStoragePath(run.project_id, run.id, artifactId, artifactType.extension);

  try {
    const { signedUrl } = await testExecutionRepository.createSignedUpload(storagePath);
    return {
      artifactId,
      storagePath,
      signedUrl,
      mimeType: file.mimeType,
    };
  } catch (error) {
    throw new TestExecutionError(toUserFacingError(error));
  }
}

export async function completeTestArtifactUpload(input: {
  projectId: string;
  testRunId: string;
  artifactId: string;
  storagePath: string;
  file: ArtifactFileDescriptor;
  sha256: string;
  metadata: RunExecutionMetadata;
}): Promise<string> {
  const metadata = executionMetadataSchema.parse(input.metadata);
  const artifactId = artifactIdSchema.parse(input.artifactId);
  const sha256 = sha256Schema.parse(input.sha256);
  const run = await findOpenRun(input.projectId, input.testRunId);
  const file = normalizeAndValidateFileDescriptor(input.file);
  const artifactType = supportedArtifacts[file.mimeType]!;
  const expectedPath = artifactStoragePath(run.project_id, run.id, artifactId, artifactType.extension);
  if (input.storagePath !== expectedPath) throw new TestExecutionError("上传文件路径与当前测试项不一致。");

  try {
    const existing = await testExecutionRepository.findArtifactByStoragePath(expectedPath, run.id);
    if (existing) {
      if (existing.test_run_id !== run.id || existing.id !== artifactId || existing.size_bytes !== file.size || existing.sha256 !== sha256) {
        throw new TestExecutionError("已保存文件与本次上传不一致，请移除后重新上传。");
      }
      return existing.id;
    }

    const stored = await testExecutionRepository.getStorageObjectInfo(expectedPath);
    const storedMimeType = stored.contentType.split(";", 1)[0]?.trim();
    if (stored.size !== file.size || storedMimeType !== file.mimeType) {
      throw new TestExecutionError("Storage 中的文件大小或类型与本次上传不一致。");
    }

    let verifiedSha256 = sha256;
    let imageBytes: Uint8Array | undefined;
    if (artifactType.kind === "text" || artifactType.kind === "image") {
      const bytes = await testExecutionRepository.readStorageObject(expectedPath, artifactType.kind === "text" ? maxTextArtifactBytes : maxArtifactBytes);
      validateFileSignature(bytes, file.mimeType);
      verifiedSha256 = createHash("sha256").update(bytes).digest("hex");
      if (verifiedSha256 !== sha256) throw new TestExecutionError("上传文件完整性校验失败，请重试。");
      if (artifactType.kind === "image") imageBytes = bytes;
    } else {
      validateFileSignature(await testExecutionRepository.readStorageObjectPrefix(expectedPath, 32), file.mimeType);
    }

    const analysisImage = imageBytes
      ? analysisImageMetadata(await storeAnalysisImage(expectedPath, imageBytes, file.mimeType)) : undefined;
    return await testExecutionRepository.recordArtifact(run.id, {
        id: artifactId,
        kind: artifactType.kind,
        storagePath: expectedPath,
        fileName: file.name,
        mimeType: file.mimeType,
        sizeBytes: file.size,
        sha256: verifiedSha256,
        metadata: {
          originalLastModified: file.lastModified,
          capturedAs: "raw_test_output",
          uploadMethod: "supabase_signed_url",
          storageEtag: stored.etag,
          ...(analysisImage ? { analysisImage } : {}),
        } satisfies Json,
      }, metadata);
  } catch (error) {
    const recorded = await testExecutionRepository.findArtifactByStoragePath(expectedPath, run.id).catch(() => {
      throw new TestExecutionError("上传结果暂未确认，请重试确认；原文件已保留。");
    });
    if (recorded) {
      if (recorded.test_run_id !== run.id || recorded.id !== artifactId || recorded.size_bytes !== file.size || recorded.sha256 !== sha256) {
        throw new TestExecutionError("已保存文件与本次上传不一致，请刷新核对；原文件已保留。");
      }
      return recorded.id;
    }
    try { await testExecutionRepository.removeStorageObject(expectedPath); }
    catch { throw new TestExecutionError("文件未保存，临时文件清理未完成，请重试上传。"); }
    if (error instanceof TestExecutionError) throw error;
    if (error instanceof AnalysisImageError) throw new TestExecutionError(error.message);
    throw new TestExecutionError(toUserFacingError(error));
  }
}

export async function finalizeTestExecution(projectId: string, protocolId: string): Promise<void> {
  const workspace = await getTestExecutionWorkspace(projectId);
  if (!workspace || workspace.protocol.id !== protocolId) throw new TestExecutionError("只能完成当前锁定 Protocol 的测试。");

  for (const run of workspace.testRuns) {
    const testCase = workspace.protocol.testCases.find((item) => item.id === run.testCaseId);
    if (!testCase) throw new TestExecutionError("测试项与锁定 Protocol 不一致。");
    if (run.artifacts.length === 0) {
      throw new TestExecutionError(`「${testCase.title}」仍未上传原始结果。`);
    }
  }

  try {
    await testExecutionRepository.finalize(projectId, protocolId);
  } catch (error) {
    throw new TestExecutionError(toUserFacingError(error));
  }
}

async function mapTestRun(row: TestRunRow, artifactRows: TestArtifactRow[]): Promise<TestRun> {
  return {
    id: row.id,
    projectId: row.project_id,
    protocolId: row.protocol_id,
    testCaseId: row.test_case_id,
    productId: row.product_id,
    status: row.status,
    generationTimeSeconds: row.generation_time_seconds ?? undefined,
    retryCount: row.retry_count,
    manuallyEdited: row.manually_edited,
    notes: row.notes ?? undefined,
    artifacts: await Promise.all(artifactRows.map(mapArtifact)),
  };
}

async function mapArtifact(row: TestArtifactRow): Promise<TestArtifact> {
  const signedUrl = await memoPageRead(`artifact-url:${row.storage_path}`, () => testExecutionRepository.createSignedUrl(row.storage_path));
  return {
    id: row.id,
    kind: row.kind,
    fileName: row.file_name,
    fileType: row.mime_type,
    sizeBytes: row.size_bytes,
    sha256: row.sha256 ?? undefined,
    fileUrl: signedUrl,
    previewUrl: row.kind === "image" ? signedUrl : undefined,
    createdAt: row.created_at,
  };
}

function normalizeAndValidateFile(file: File) {
  const descriptor = normalizeAndValidateFileDescriptor({
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified || null,
  });
  return { file, mimeType: descriptor.mimeType };
}

function normalizeAndValidateFileDescriptor(file: ArtifactFileDescriptor) {
  if (!Number.isSafeInteger(file.size) || file.size <= 0) throw new TestExecutionError("请选择非空的测试结果文件。");
  if (file.size > maxArtifactBytes) throw new TestExecutionError("单个文件不能超过 50 MB。");
  const fileName = typeof file.name === "string" ? file.name.trim() : "";
  if (!fileName || fileName.length > 255) throw new TestExecutionError("文件名无效或过长。");

  let mimeType = typeof file.type === "string" ? file.type.toLowerCase() : "";
  const extension = fileName.split(".").pop()?.toLowerCase();
  const inferredMimeType = extension ? mimeTypeByExtension[extension] : undefined;
  if ((!mimeType || mimeType === "application/octet-stream") && inferredMimeType) mimeType = inferredMimeType;
  const shouldUseMoreSpecificTextType = inferredMimeType?.startsWith("text/") || inferredMimeType === "application/json";
  if (mimeType === "text/plain" && inferredMimeType && shouldUseMoreSpecificTextType) {
    mimeType = inferredMimeType;
  }
  if (!supportedArtifacts[mimeType]) {
    throw new TestExecutionError("支持图片、PDF、Word、Excel、PPT、文本和常用视频文件。");
  }
  if (supportedArtifacts[mimeType].kind === "text" && file.size > maxTextArtifactBytes) {
    throw new TestExecutionError("文本结果不能超过 500 KB；请只保留完成任务和评分所需的原始内容。");
  }
  const lastModified = file.lastModified === null || file.lastModified === 0
    ? null
    : Number.isSafeInteger(file.lastModified) && file.lastModified > 0
      ? file.lastModified
      : null;
  return { name: fileName, size: file.size, type: mimeType, lastModified, mimeType };
}

async function findOpenRun(projectId: string, testRunId: string) {
  const run = await testExecutionRepository.findRun(testRunId);
  if (!run || run.project_id !== projectId) throw new TestExecutionError("测试项不存在或不属于当前项目。");
  if (run.status === "ready_for_review" || run.status === "invalid") throw new TestExecutionError("当前测试项已关闭上传。");
  const latest = (await protocolsRepository.listByProject(projectId))[0];
  if (latest?.id !== run.protocol_id || latest.status !== 'locked') throw new TestExecutionError("测试版本已变化，请刷新后重新选择文件。");
  return run;
}

function artifactStoragePath(projectId: string, testRunId: string, artifactId: string, extension: string) {
  return `projects/${projectId}/runs/${testRunId}/${artifactId}.${extension}`;
}

function validateFileSignature(bytes: Uint8Array, mimeType: string) {
  const textMime = ["text/plain", "text/markdown", "application/json", "text/csv"].includes(mimeType);
  const openXmlMime = mimeType.startsWith("application/vnd.openxmlformats-officedocument.");
  const legacyOfficeMime = ["application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint"].includes(mimeType);
  const matches = mimeType === "image/png"
    ? startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    : mimeType === "image/jpeg"
      ? startsWith(bytes, [0xff, 0xd8, 0xff])
      : mimeType === "image/webp"
        ? ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP"
        : mimeType === "application/pdf"
          ? ascii(bytes, 0, 5) === "%PDF-"
          : mimeType === "video/webm"
            ? startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])
            : mimeType === "video/mp4" || mimeType === "video/quicktime"
              ? ascii(bytes, 4, 8) === "ftyp"
              : openXmlMime
                ? startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])
                : legacyOfficeMime
                  ? startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
              : textMime && isValidUtf8Text(bytes);
  if (!matches) throw new TestExecutionError("文件内容与声明的文件类型不一致。");
}

function startsWith(bytes: Uint8Array, signature: number[]) { return signature.every((value, index) => bytes[index] === value); }
function ascii(bytes: Uint8Array, start: number, end: number) { return String.fromCharCode(...bytes.slice(start, end)); }
function isValidUtf8Text(bytes: Uint8Array) {
  try { return !new TextDecoder("utf-8", { fatal: true }).decode(bytes).includes("\u0000"); } catch { return false; }
}
function toUserFacingError(error: unknown) {
  if (error instanceof z.ZodError) return "测试执行元数据无效，请检查后重试。";
  if (error instanceof RepositoryError) return "测试结果保存失败，请重试；失败记录不会伪装成已上传。";
  return "测试执行操作失败，请稍后重试。";
}
