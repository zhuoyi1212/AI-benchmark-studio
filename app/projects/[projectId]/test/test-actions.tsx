"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CheckCircle2, Clipboard, FilePlus2, LoaderCircle, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { finalizeTestExecutionAction, startProfessionalReviewAction, uploadTestArtifactAction, type TestExecutionActionState } from "@/app/projects/[projectId]/test/actions";
import { clipboardImageFiles, queueArtifact, uploadArtifactQueue, type ArtifactUploadEntry } from "@/lib/artifact-upload-queue";
import type { TestRun } from "@/lib/types/test-run";

const initialState: TestExecutionActionState = { ok: false, message: null };

export function CopyPromptButton({ prompt }: { prompt: string }) {
  const copy = async () => {
    try { await navigator.clipboard.writeText(prompt); toast.success("锁定 Prompt 已复制"); }
    catch { toast.error("复制失败，请手动选择 Prompt。"); }
  };
  return <Button variant="ghost" size="sm" onClick={copy}><Clipboard className="h-3.5 w-3.5" />复制 Prompt</Button>;
}

export function UploadArtifactAction({ projectId, run, productName }: { projectId: string; run: TestRun; productName: string }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ArtifactUploadEntry[]>([]);
  const [rawText, setRawText] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const uploading = useRef(false);

  const addFiles = (files: File[]) => {
    if (uploading.current) return;
    setEntries(current => [...current, ...files.map(queueArtifact)]);
    setMessage(null);
  };
  const pasteImages = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (uploading.current) return;
    const images = clipboardImageFiles(event.clipboardData);
    if (!images.length) return; // Keep ordinary text paste native, including in textareas.
    event.preventDefault();
    addFiles(images);
  };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (uploading.current) return;
    const metadata = new FormData(event.currentTarget);
    const batch = rawText.trim()
      ? [...entries, queueArtifact(new File([rawText], "pasted-raw-output.txt", { type: "text/plain" }))]
      : entries;
    if (!batch.some(entry => entry.status !== "saved")) {
      setMessage("请选择结果文件、粘贴截图或填写原始文本。");
      return;
    }
    uploading.current = true;
    setPending(true);
    setMessage(null);
    setEntries(batch);
    setRawText(""); // Text is now a queued file, retained even when its upload fails.
    try {
      const completed = await uploadArtifactQueue(batch, metadata,
        form => uploadTestArtifactAction(initialState, form),
        updated => setEntries(current => current.map(entry => entry.id === updated.id ? updated : entry)),
      );
      const failed = completed.filter(entry => entry.status === "failed").length;
      if (failed) setMessage(`${completed.length - failed} 个已保存，${failed} 个失败；重试只处理未成功的文件。`);
      else {
        toast.success(`${productName} · ${completed.length} 个原始文件已保存`);
        setEntries([]);
        setOpen(false);
      }
    } finally {
      uploading.current = false;
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={value => { if (!uploading.current) setOpen(value); }}>
      <DialogTrigger asChild><Button variant="outline" size="sm">{run.artifacts.length > 0 ? <FilePlus2 className="h-3.5 w-3.5" /> : <UploadCloud className="h-3.5 w-3.5" />}{run.artifacts.length > 0 ? "添加原始文件" : "上传测试结果"}</Button></DialogTrigger>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto" onPaste={pasteImages}>
        <DialogTitle>{productName} · 上传原始测试结果</DialogTitle>
        <DialogDescription>支持多选文件、粘贴截图，也可直接粘贴文本。请保留原始输出。</DialogDescription>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="testRunId" value={run.id} />
          <div tabIndex={0} aria-label="粘贴图片区域" className="rounded-lg border border-dashed p-3 outline-none focus:ring-2 focus:ring-blue-200">
            <Field label="结果文件"><Input type="file" multiple disabled={pending} onChange={event => { addFiles(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ""; }} accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,text/markdown,application/json,text/csv,video/mp4,video/webm,video/quicktime,.md,.json,.csv,.mov" /></Field>
            <p className="mt-2 text-xs text-muted-foreground">可多选、继续添加，或在此按 ⌘V / Ctrl+V 粘贴截图。</p>
          </div>
          {entries.length > 0 && <ul aria-label="待上传文件" className="max-h-44 space-y-2 overflow-y-auto rounded-md border p-3">{entries.map(entry => <li key={entry.id} className="flex items-start gap-2 text-xs">
            <div className="min-w-0 flex-1"><span className="block break-all">{entry.file.name}</span><span className={entry.status === "failed" ? "text-red-600" : "text-muted-foreground"}>{entry.status === "saved" ? "已保存" : entry.status === "uploading" ? "正在上传…" : entry.status === "failed" ? entry.error : `${Math.max(1, Math.ceil(entry.file.size / 1024))} KB · 待上传`}</span></div>
            {entry.status === "saved" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" disabled={pending} aria-label={`移除 ${entry.file.name}`} onClick={() => setEntries(current => current.filter(item => item.id !== entry.id))}><X className="h-3.5 w-3.5" /></Button>}
          </li>)}</ul>}
          <p role="status" className="sr-only">{pending ? `已保存 ${entries.filter(entry => entry.status === "saved").length} / ${entries.length} 个文件` : ""}</p>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground"><span className="h-px flex-1 bg-slate-200" /><span>也可添加文本</span><span className="h-px flex-1 bg-slate-200" /></div>
          <Field label="原始文本结果"><Textarea name="rawText" value={rawText} onChange={event => setRawText(event.target.value)} disabled={pending} maxLength={500000} rows={5} placeholder="粘贴产品的完整原始文本、代码、终端输出或执行记录；无需先另存为 TXT。" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="生成耗时（秒）"><Input name="generationTimeSeconds" disabled={pending} type="number" min={0} max={86400} defaultValue={run.generationTimeSeconds ?? ""} placeholder="可选" /></Field>
            <Field label="重试次数"><Input name="retryCount" disabled={pending} type="number" min={0} max={20} defaultValue={run.retryCount ?? 0} required /></Field>
          </div>
          <label className="flex items-start gap-2.5 rounded-md border bg-slate-50 p-3 text-xs leading-5 text-slate-700"><input name="manuallyEdited" disabled={pending} type="checkbox" defaultChecked={run.manuallyEdited} className="mt-1" /><span><span className="font-medium">结果经过人工编辑</span><br /><span className="text-muted-foreground">标准化测试通常应保持未勾选；如有编辑，请如实记录。</span></span></label>
          <Field label="执行备注"><Textarea name="notes" disabled={pending} maxLength={2000} defaultValue={run.notes ?? ""} placeholder="可选：记录导出格式、异常或执行环境" /></Field>
          <p className="text-[11px] leading-5 text-muted-foreground">图片、PDF 和视频单文件不超过 50 MB；文本不超过 500 KB。视频请上传产品直接生成的原始文件，不要先剪辑或二次导出。</p>
          {message && <p role="alert" className="text-xs leading-5 text-red-600">{message}</p>}
          <div className="flex justify-end gap-2"><DialogClose asChild><Button type="button" variant="outline" disabled={pending}>取消</Button></DialogClose><Button type="submit" disabled={pending}>{pending ? <><LoaderCircle className="h-4 w-4 animate-spin" />正在上传...</> : <><UploadCloud className="h-4 w-4" />保存原始结果</>}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function FinalizeExecutionAction({ projectId, protocolId }: { projectId: string; protocolId: string }) {
  const [state, formAction, pending] = useActionState(finalizeTestExecutionAction, initialState);
  useEffect(() => { if (state.message && state.ok) toast.success(state.message); }, [state]);
  return <form action={formAction} className="flex flex-col items-end gap-2"><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="protocolId" value={protocolId} /><Button type="submit" size="lg" disabled={pending}>{pending ? <><LoaderCircle className="h-4 w-4 animate-spin" />正在确认...</> : <><CheckCircle2 className="h-4 w-4" />确认全部测试结果</>}</Button>{state.message && !state.ok && <p role="alert" className="max-w-sm text-right text-xs text-red-600">{state.message}</p>}</form>;
}

export function ProfessionalReviewAction({
  projectId,
  protocolId,
  label = "专业评分（可选）",
}: {
  projectId: string;
  protocolId: string;
  label?: string;
}) {
  const [state, formAction, pending] = useActionState(startProfessionalReviewAction, initialState);
  return <form action={formAction} className="flex flex-col items-end gap-2">
    <input type="hidden" name="projectId" value={projectId} />
    <input type="hidden" name="protocolId" value={protocolId} />
    <Button type="submit" variant="outline" disabled={pending}>
      {pending ? <><LoaderCircle className="h-4 w-4 animate-spin" />正在进入专业模式...</> : label}
    </Button>
    {state.message && !state.ok && <p role="alert" className="max-w-sm text-right text-xs text-red-600">{state.message}</p>}
  </form>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-medium text-slate-700">{label}</span>{children}</label>;
}
