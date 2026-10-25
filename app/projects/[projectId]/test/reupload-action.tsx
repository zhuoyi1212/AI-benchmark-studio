"use client";

import { useActionState, useState } from 'react';
import { LoaderCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { restartTestExecutionAction } from './actions';

export function ReuploadAction({ projectId, protocolId, fileCount }: { projectId: string; protocolId: string; fileCount: number }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(restartTestExecutionAction, { ok: false, message: null });
  return <Dialog open={open} onOpenChange={value => { if (!pending) setOpen(value); }}>
    <DialogTrigger asChild><Button variant="outline" size="sm"><RotateCcw className="h-3.5 w-3.5" />移除文件并重新上传</Button></DialogTrigger>
    <DialogContent className="max-w-md">
      <DialogTitle>重新上传本轮测试文件？</DialogTitle>
      <DialogDescription>本轮 {fileCount} 个文件将移出当前上传列表。原文件和旧分析保留在历史中。</DialogDescription>
      <p className="text-sm leading-6 text-muted-foreground">沿用相同任务和提示词，新开一轮测试。请重新上传所有产品的结果，上传完成后重新分析。</p>
      <form action={action} className="space-y-4">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="protocolId" value={protocolId} />
        {state.message && <p role="alert" className="text-sm text-red-600">{state.message}</p>}
        <div className="flex justify-end gap-2">
          <DialogClose asChild><Button type="button" variant="outline" disabled={pending}>取消</Button></DialogClose>
          <Button type="submit" disabled={pending}>{pending ? <><LoaderCircle className="h-4 w-4 animate-spin" />正在准备…</> : '确认，重新上传'}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
