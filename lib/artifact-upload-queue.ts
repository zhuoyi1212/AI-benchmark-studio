export type ArtifactUploadEntry = {
  id: string;
  file: File;
  status: "queued" | "uploading" | "saved" | "failed";
  error: string | null;
  progress: number;
};

export function queueArtifact(file: File): ArtifactUploadEntry {
  return { id: createUploadId(), file, status: "queued", error: null, progress: 0 };
}

function createUploadId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // randomUUID is secure-context-only; getRandomValues also works on LAN HTTP.
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function clipboardImageFiles(data: Pick<DataTransfer, "items" | "files">): File[] {
  const items = Array.from(data.items)
    .filter(item => item.kind === "file" && item.type.startsWith("image/"))
    .map(item => item.getAsFile())
    .filter((file): file is File => file !== null);
  // Some browsers expose pasted files without DataTransferItem entries.
  const images = items.length ? items : Array.from(data.files).filter(file => file.type.startsWith("image/"));
  return images.map(file => {
    const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1] || "png";
    return new File([file], `clipboard-${createUploadId()}.${extension}`, { type: file.type, lastModified: file.lastModified });
  });
}

// Files stay sequential so progress is clear and retries do not compete for bandwidth.
// Successful entries remain in the queue and are skipped on explicit retry.
export async function uploadArtifactQueue(
  entries: ArtifactUploadEntry[],
  upload: (
    entry: ArtifactUploadEntry,
    quickBatchComplete: boolean,
    onProgress: (progress: number) => void,
  ) => Promise<{ ok: boolean; message: string | null }>,
  onUpdate: (entry: ArtifactUploadEntry) => void,
): Promise<ArtifactUploadEntry[]> {
  const result: ArtifactUploadEntry[] = [];
  for (const entry of entries) {
    if (entry.status === "saved") { result.push(entry); continue; }
    let active: ArtifactUploadEntry = { ...entry, status: "uploading", error: null };
    onUpdate(active);
    const remaining = entries.slice(entries.indexOf(entry) + 1).some(item => item.status !== "saved");
    let outcome: { ok: boolean; message: string | null };
    try {
      outcome = await upload(
        entry,
        !remaining && result.every(item => item.status === "saved"),
        progress => {
          active = { ...active, progress: Math.max(active.progress, Math.min(100, Math.round(progress))) };
          onUpdate(active);
        },
      );
    } catch {
      outcome = { ok: false, message: "上传中断；点击重试会重新上传这个文件。" };
    }
    const updated: ArtifactUploadEntry = {
      ...active,
      status: outcome.ok ? "saved" : "failed",
      progress: outcome.ok ? 100 : active.progress,
      error: outcome.ok ? null : outcome.message ?? "上传失败，请重试。",
    };
    result.push(updated);
    onUpdate(updated);
  }
  return result;
}
