import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { RepositoryError } from "@/lib/repositories/repository-error";
import {
  testExecutionRepository,
  type RunExecutionMetadata,
} from "@/lib/repositories/test-execution.repository";
import { getProtocolWorkspace } from "@/lib/services/protocols.service";
import type { Json, TestArtifactRow, TestRunRow } from "@/lib/types/database";
import type { TestArtifact, TestExecutionWorkspace, TestRun } from "@/lib/types/test-run";

const maxArtifactBytes = 50 * 1024 * 1024;
const executionMetadataSchema = z.object({
  generationTimeSeconds: z.number().int().min(0).max(86400).nullable(),
  retryCount: z.number().int().min(0).max(20),
  manuallyEdited: z.boolean(),
  notes: z.string().trim().max(2000).nullable(),
});

type SupportedArtifact = {
  kind: "image" | "pdf" | "text";
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "application/pdf" | "text/plain";
  extension: "png" | "jpg" | "webp" | "pdf" | "txt";
};

const supportedArtifacts: Record<string, SupportedArtifact> = {
  "image/png": { kind: "image", mimeType: "image/png", extension: "png" },
  "image/jpeg": { kind: "image", mimeType: "image/jpeg", extension: "jpg" },
  "image/webp": { kind: "image", mimeType: "image/webp", extension: "webp" },
  "application/pdf": { kind: "pdf", mimeType: "application/pdf", extension: "pdf" },
  "text/plain": { kind: "text", mimeType: "text/plain", extension: "txt" },
};

export class TestExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TestExecutionError";
  }
}

export async function getTestExecutionWorkspace(projectId: string): Promise<TestExecutionWorkspace | null> {
  const protocolWorkspace = await getProtocolWorkspace(projectId);
  const protocol = protocolWorkspace?.protocol;
  if (!protocolWorkspace || !protocol || protocol.status !== "locked") return null;

  try {
    if (["protocol_locked", "testing"].includes(protocolWorkspace.research.project.status)) {
      await testExecutionRepository.ensureMatrix(projectId, protocol.id);
    }
    const rows = await testExecutionRepository.listRuns(protocol.id);
    const artifacts = await testExecutionRepository.listArtifacts(rows.map((row) => row.id));
    const artifactsByRun = Map.groupBy(artifacts, (artifact) => artifact.test_run_id);
    const mappedRuns = await Promise.all(rows.map((row) => mapTestRun(row, artifactsByRun.get(row.id) ?? [])));
    return {
      project: {
        id: protocolWorkspace.research.project.id,
        name: protocolWorkspace.research.project.name,
        products: protocolWorkspace.research.project.products.map(({ id, name, initials }) => ({ id, name, initials })),
      },
      protocol,
      testRuns: mappedRuns,
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
  const run = await testExecutionRepository.findRun(input.testRunId);
  if (!run || run.project_id !== input.projectId) throw new TestExecutionError("测试项不存在或不属于当前项目。");
  if (run.status === "ready_for_review" || run.status === "invalid") {
    throw new TestExecutionError("当前测试项已关闭上传。");
  }
  const file = validateFile(input.file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  validateFileSignature(bytes, file.type);
  const artifactType = supportedArtifacts[file.type]!;
  const artifactId = randomUUID();
  const storagePath = `projects/${run.project_id}/runs/${run.id}/${artifactId}.${artifactType.extension}`;
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  try {
    await testExecutionRepository.uploadStorageObject(storagePath, bytes, artifactType.mimeType);
    try {
      return await testExecutionRepository.recordArtifact(run.id, {
        id: artifactId,
        kind: artifactType.kind,
        storagePath,
        fileName: file.name.trim(),
        mimeType: artifactType.mimeType,
        sizeBytes: file.size,
        sha256,
        metadata: {
          originalLastModified: file.lastModified || null,
          capturedAs: "raw_test_output",
        } satisfies Json,
      }, metadata);
    } catch (error) {
      try {
        await testExecutionRepository.removeStorageObject(storagePath);
      } catch {
        // The immutable database evidence was not created; preserve the original error.
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof TestExecutionError) throw error;
    throw new TestExecutionError(toUserFacingError(error));
  }
}

export async function finalizeTestExecution(projectId: string, protocolId: string): Promise<void> {
  const workspace = await getTestExecutionWorkspace(projectId);
  if (!workspace || workspace.protocol.id !== protocolId) {
    throw new TestExecutionError("只能完成当前锁定 Protocol 的测试。");
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
  const signedUrl = await testExecutionRepository.createSignedUrl(row.storage_path);
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

function validateFile(file: File) {
  if (!(file instanceof File) || file.size <= 0) throw new TestExecutionError("请选择非空的测试结果文件。");
  if (file.size > maxArtifactBytes) throw new TestExecutionError("单个文件不能超过 50 MB。");
  if (!file.name.trim() || file.name.trim().length > 255) throw new TestExecutionError("文件名无效或过长。");
  if (!supportedArtifacts[file.type]) throw new TestExecutionError("仅支持 PNG、JPEG、WebP、PDF 或纯文本文件。");
  return file;
}

function validateFileSignature(bytes: Uint8Array, mimeType: string) {
  const matches = mimeType === "image/png"
    ? startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    : mimeType === "image/jpeg"
      ? startsWith(bytes, [0xff, 0xd8, 0xff])
      : mimeType === "image/webp"
        ? ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP"
        : mimeType === "application/pdf"
          ? ascii(bytes, 0, 5) === "%PDF-"
          : isValidUtf8Text(bytes);
  if (!matches) throw new TestExecutionError("文件内容与声明的文件类型不一致。");
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.slice(start, end));
}

function isValidUtf8Text(bytes: Uint8Array) {
  try {
    const value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return !value.includes("\u0000");
  } catch {
    return false;
  }
}

function toUserFacingError(error: unknown) {
  if (error instanceof z.ZodError) return "测试执行元数据无效，请检查后重试。";
  if (error instanceof RepositoryError) return "测试结果保存失败，请重试；失败记录不会伪装成已上传。";
  return "测试执行操作失败，请稍后重试。";
}
