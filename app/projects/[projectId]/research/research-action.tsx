"use client";

import { useActionState } from "react";
import { LoaderCircle, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { startResearchAction, type ResearchActionState } from "@/app/projects/[projectId]/research/actions";

const initialState: ResearchActionState = { message: null };

export function ResearchAction({ projectId, retry = false, preserveHistory = false, forceRefresh = false }: { projectId: string; retry?: boolean; preserveHistory?: boolean; forceRefresh?: boolean }) {
  const [state, formAction, pending] = useActionState(startResearchAction, initialState);
  const submitButton = <Button type="submit" size="lg" disabled={pending}>
    {pending ? <><LoaderCircle className="h-4 w-4 animate-spin" />正在调研并分析...</> : retry ? <><RefreshCw className="h-4 w-4" />重新调研</> : <><Search className="h-4 w-4" />开始产品调研</>}
  </Button>;
  if (retry && preserveHistory) {
    return (
      <div className="flex flex-col items-end gap-2">
        <Dialog>
          <DialogTrigger asChild><Button type="button" size="lg"><RefreshCw className="h-4 w-4" />重新调研</Button></DialogTrigger>
          <DialogContent>
            <DialogTitle>生成新的调研版本？</DialogTitle>
            <DialogDescription>新的 ResearchRun 会作为独立版本保存。现有 Protocol、测试、评分、报告和发布包仍会保留为历史记录；只有主动生成并锁定新的 Protocol 后，才会开始新的后续流程。</DialogDescription>
            <form action={formAction} className="mt-6 flex justify-end gap-2">
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="forceRefresh" value={String(forceRefresh)} />
              <DialogClose asChild><Button type="button" variant="outline" disabled={pending}>取消</Button></DialogClose>
              <Button type="submit" disabled={pending}>{pending ? <><LoaderCircle className="h-4 w-4 animate-spin" />正在调研...</> : "确认生成新版本"}</Button>
            </form>
          </DialogContent>
        </Dialog>
        {state.message && <p role="alert" className="max-w-sm text-right text-xs leading-5 text-red-600">{state.message}</p>}
      </div>
    );
  }
  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="forceRefresh" value={String(forceRefresh)} />
      {submitButton}
      {state.message && <p role="alert" className="max-w-sm text-right text-xs leading-5 text-red-600">{state.message}</p>}
    </form>
  );
}
