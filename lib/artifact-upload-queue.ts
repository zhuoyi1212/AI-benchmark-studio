export type ArtifactUploadEntry = {
  id: string;
  file: File;
  status: "queued" | "uploading" | "saved" | "failed";
  error: string | null;
};

export function queueArtifact(file: File): ArtifactUploadEntry {
  return { id: createUploadId(), file, status: "queued", error: null };
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

// One server action per file keeps large batches within the existing request limit.
// Successful entries remain in the queue and are skipped on explicit retry.
export async function uploadArtifactQueue(
  entries: ArtifactUploadEntry[],
  metadata: FormData,
  upload: (form: FormData) => Promise<{ ok: boolean; message: string | null }>,
  onUpdate: (entry: ArtifactUploadEntry) => void,
): Promise<ArtifactUploadEntry[]> {
  const result: ArtifactUploadEntry[] = [];
  for (const entry of entries) {
    if (entry.status === "saved") { result.push(entry); continue; }
    onUpdate({ ...entry, status: "uploading", error: null });
    const form = new FormData();
    for (const [key, value] of metadata) {
      if (key !== "artifact" && key !== "rawText") form.append(key, value);
    }
    form.set("artifact", entry.file);
    const remaining = entries.slice(entries.indexOf(entry) + 1).some(item => item.status !== "saved");
    form.set("quickBatchComplete", String(!remaining && result.every(item => item.status === "saved")));
    let outcome: { ok: boolean; message: string | null };
    try { outcome = await upload(form); }
    catch { outcome = { ok: false, message: "连接中断，未确认保存结果；请先核对已上传文件再重试。" }; }
    const updated: ArtifactUploadEntry = {
      ...entry,
      status: outcome.ok ? "saved" : "failed",
      error: outcome.ok ? null : outcome.message ?? "上传失败，请重试。",
    };
    result.push(updated);
    onUpdate(updated);
  }
  return result;
}
