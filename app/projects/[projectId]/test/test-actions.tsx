"use client";

import { useActionState, useEffect, useState } from "react";
import { CheckCircle2, Clipboard, FilePlus2, LoaderCircle, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { finalizeTestExecutionAction, uploadTestArtifactAction, type TestExecutionActionState } from "@/app/projects/[projectId]/test/actions";
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
  const [state, formAction, pending] = useActionState(uploadTestArtifactAction, initialState);

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) { toast.success(`${productName} 测试结果已保存`); setOpen(false); }
  }, [productName, state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" size="sm">{run.artifacts.length > 0 ? <FilePlus2 className="h-3.5 w-3.5" /> : <UploadCloud className="h-3.5 w-3.5" />}{run.artifacts.length > 0 ? "添加原始文件" : "上传测试结果"}</Button></DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogTitle>{productName} · 上传原始测试结果</DialogTitle>
        <DialogDescription>保存未经后期编辑的原始输出。支持图片、PDF、TXT/MD/JSON/CSV 与 MP4/WebM/MOV；单文件不超过 50 MB。</DialogDescription>
        <form action={formAction} className="mt-5 space-y-4">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="testRunId" value={run.id} />
          <Field label="结果文件"><Input name="artifact" type="file" accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,text/markdown,application/json,text/csv,video/mp4,video/webm,video/quicktime,.md,.json,.csv,.mov" required /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="生成耗时（秒）"><Input name="generationTimeSeconds" type="number" min={0} max={86400} defaultValue={run.generationTimeSeconds ?? ""} placeholder="可选" /></Field>
            <Field label="重试次数"><Input name="retryCount" type="number" min={0} max={20} defaultValue={run.retryCount ?? 0} required /></Field>
          </div>
          <label className="flex items-start gap-2.5 rounded-md border bg-slate-50 p-3 text-xs leading-5 text-slate-700"><input name="manuallyEdited" type="checkbox" defaultChecked={run.manuallyEdited} className="mt-1" /><span><span className="font-medium">结果经过人工编辑</span><br /><span className="text-muted-foreground">标准化测试通常应保持未勾选；如有编辑，请如实记录。</span></span></label>
          <Field label="执行备注"><Textarea name="notes" maxLength={2000} defaultValue={run.notes ?? ""} placeholder="可选：记录导出格式、异常或执行环境" /></Field>
          <p className="text-[11px] leading-5 text-muted-foreground">视频请上传产品直接生成的原始文件；不要先剪辑、压缩或二次导出后再作为原始证据。</p>
          {state.message && !state.ok && <p role="alert" className="text-xs leading-5 text-red-600">{state.message}</p>}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-medium text-slate-700">{label}</span>{children}</label>;
}
