"use client";

import type { PreparedArtifactUpload } from "@/lib/types/test-run";

const retryDelays = [0, 1_000, 3_000];

export async function sha256File(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function uploadArtifactDirectly(
  file: File,
  prepared: PreparedArtifactUpload,
  onProgress: (percentage: number) => void,
): Promise<void> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
    if (retryDelays[attempt] > 0) await wait(retryDelays[attempt]);
    try {
      await uploadOnce(file, prepared, onProgress);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("上传失败，请重试。");
      if (!(error instanceof RetryableUploadError)) break;
    }
  }
  throw lastError ?? new Error("上传失败，请重试。");
}

class RetryableUploadError extends Error {}

function uploadOnce(
  file: File,
  prepared: PreparedArtifactUpload,
  onProgress: (percentage: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const uploadFile = file.type === prepared.mimeType
      ? file
      : new File([file], file.name, { type: prepared.mimeType, lastModified: file.lastModified });
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", uploadFile);

    const request = new XMLHttpRequest();
    request.open("PUT", prepared.signedUrl);
    request.timeout = 10 * 60 * 1_000;
    request.setRequestHeader("x-upsert", "false");
    request.upload.onprogress = event => {
      if (event.lengthComputable && event.total > 0) onProgress((event.loaded / event.total) * 100);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve();
        return;
      }
      // A lost success response can make a retry see the already-created object.
      // Server-side completion still verifies size, MIME type and file signature.
      if ((request.status === 400 || request.status === 409) && /already exists|resource exists|duplicate/i.test(request.responseText)) {
        resolve();
        return;
      }
      const retryable = request.status === 408 || request.status === 429 || request.status >= 500;
      reject(retryable
        ? new RetryableUploadError(`上传服务暂时不可用（${request.status}）。`)
        : new Error(`上传失败（${request.status}），请重试。`));
    };
    request.onerror = () => reject(new RetryableUploadError("网络连接中断。"));
    request.ontimeout = () => reject(new RetryableUploadError("上传超时。"));
    request.onabort = () => reject(new Error("上传已取消。"));
    request.send(body);
  });
}

function wait(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}
