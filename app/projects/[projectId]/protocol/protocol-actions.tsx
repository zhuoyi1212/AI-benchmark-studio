"use client";

import { useActionState, useEffect, useRef } from "react";
import { LoaderCircle, LockKeyhole, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  generateProtocolAction,
  lockProtocolAction,
  prepareQuickProtocolAction,
  removeDraftTestCaseAction,
  type ProtocolActionState,
} from "@/app/projects/[projectId]/protocol/actions";

const initialState: ProtocolActionState = { message: null };

export function AutoPrepareQuickProtocol({ projectId, retry = false }: { projectId: string; retry?: boolean }) {
  const [state, formAction, pending] = useActionState(prepareQuickProtocolAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (attemptedRef.current) return;
    attemptedRef.current = true;
    formRef.current?.requestSubmit();
  }, []);

  return <form ref={formRef} action={formAction} className="flex flex-col items-center gap-2">
    <input type="hidden" name="projectId" value={projectId} />
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? <><LoaderCircle className="h-4 w-4 animate-spin" />正在自动准备方案...</>
        : retry ? <><RefreshCw className="h-4 w-4" />重试自动准备</>
          : <><Sparkles className="h-4 w-4" />继续自动准备</>}
    </Button>
    {state.message && <p role="alert" className="max-w-md text-center text-xs leading-5 text-red-600">{state.message}</p>}
  </form>;
}

export function RemoveTestCaseAction({ projectId, protocolId, testCaseId, title, disabled = false }: {
  projectId: string;
  protocolId: string;
  testCaseId: string;
  title: string;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(removeDraftTestCaseAction, initialState);
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <Dialog>
        <DialogTrigger asChild>
          <Button type="button" size="sm" variant="ghost" className="text-slate-500 hover:bg-red-50 hover:text-red-700" disabled={disabled || pending} aria-label={`删除任务：${title}`}>
            <Trash2 className="h-4 w-4" />删除
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>删除“{title}”？</DialogTitle>
          <DialogDescription>删除后，这个任务不会进入测试。剩余任务会保留，至少需要留下 1 个任务。</DialogDescription>
          <form action={formAction} className="mt-6 flex justify-end gap-2">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="protocolId" value={protocolId} />
            <input type="hidden" name="testCaseId" value={testCaseId} />
            <DialogClose asChild><Button type="button" variant="outline" disabled={pending}>取消</Button></DialogClose>
            <Button type="submit" variant="destructive" disabled={pending}>{pending ? <><LoaderCircle className="h-4 w-4 animate-spin" />正在删除...</> : "删除任务"}</Button>
          </form>
        </DialogContent>
      </Dialog>
      {!pending && state.message && <p role="alert" className="max-w-48 text-right text-[11px] leading-4 text-red-600">{state.message}</p>}
    </div>
  );
}

export function GenerateProtocolAction({ projectId, regenerate = false, experienceMode = false, preserveHistory = false }: { projectId: string; regenerate?: boolean; experienceMode?: boolean; preserveHistory?: boolean }) {
  const [state, formAction, pending] = useActionState(generateProtocolAction, initialState);
  if (regenerate && preserveHistory) {
    return (
      <div className="flex flex-col items-end gap-2">
        <Dialog>
          <DialogTrigger asChild><Button type="button" variant="outline" className="border-slate-300 bg-white text-slate-950 hover:bg-slate-100 hover:text-slate-950"><RefreshCw className="h-4 w-4" />重新生成新版本</Button></DialogTrigger>
          <DialogContent>
            <DialogTitle>生成新的 Protocol 版本？</DialogTitle>
            <DialogDescription>快速模式会生成 1 个新的核心任务。现有测试、评分、报告和发布包仍将保留为历史版本；新 Protocol 需要重新锁定后再执行。</DialogDescription>
            <form action={formAction} className="mt-6 flex justify-end gap-2">
              <input type="hidden" name="projectId" value={projectId} />
              <DialogClose asChild><Button type="button" variant="outline" disabled={pending}>取消</Button></DialogClose>
              <Button type="submit" disabled={pending}>{pending ? <><LoaderCircle className="h-4 w-4 animate-spin" />正在快速生成...</> : "确认快速生成"}</Button>
            </form>
          </DialogContent>
        </Dialog>
        {!pending && state.message && <p role="alert" className="max-w-sm text-right text-xs leading-5 text-red-300">{state.message}</p>}
      </div>
    );
  }
  return (
    <form action={formAction} className="flex flex-col items-end gap-2" aria-busy={pending}>
      <input type="hidden" name="projectId" value={projectId} />
      <Button type="submit" size={regenerate ? "default" : "lg"} variant={regenerate ? "outline" : "default"} className={regenerate ? "border-slate-300 bg-white text-slate-950 hover:bg-slate-100 hover:text-slate-950 disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-70" : undefined} disabled={pending} aria-disabled={pending}>
        {pending ? <><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />正在快速生成...</> : regenerate ? <><RefreshCw className="h-4 w-4" aria-hidden="true" />重新生成新版本</> : <><Sparkles className="h-4 w-4" aria-hidden="true" />快速生成{experienceMode ? "体验" : "测评"}方案</>}
      </Button>
      {!pending && state.message && <p role="alert" className={`max-w-sm text-right text-xs leading-5 ${regenerate ? "text-red-300" : "text-red-600"}`}>{state.message}</p>}
    </form>
  );
}

export function LockProtocolAction({ projectId, protocolId, testCaseCount, rubricCount, experienceMode = false }: {
  projectId: string;
  protocolId: string;
  testCaseCount: number;
  rubricCount: number;
  experienceMode?: boolean;
}) {
  const [state, formAction, pending] = useActionState(lockProtocolAction, initialState);
  return (
    <div className="flex flex-col items-end gap-2">
      <Dialog>
        <DialogTrigger asChild>
          <Button size="lg" className="w-full bg-white text-slate-950 hover:bg-slate-100 sm:w-auto">
            <LockKeyhole className="h-4 w-4" />确认并锁定{experienceMode ? "体验" : "测评"}方案
          </Button>
        </DialogTrigger>
        <DialogContent>
          <div className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-amber-50 text-amber-700"><LockKeyhole className="h-5 w-5" /></div>
          <DialogTitle>确认锁定当前{experienceMode ? "体验" : "测评"}方案？</DialogTitle>
          <DialogDescription>
            锁定后，本版本的 {testCaseCount} 个{experienceMode ? "体验任务" : " Test Cases"}、全部 Prompt 和 {rubricCount} 个 Rubric 维度均不可原地修改，以保证{experienceMode ? "执行一致性" : "测试公平"}。需要调整时只能生成新版本。
          </DialogDescription>
          <form action={formAction} className="mt-6 flex justify-end gap-2">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="protocolId" value={protocolId} />
            <DialogClose asChild><Button type="button" variant="outline">继续检查</Button></DialogClose>
            <Button type="submit" disabled={pending}>{pending ? <><LoaderCircle className="h-4 w-4 animate-spin" />正在锁定...</> : "确认锁定"}</Button>
          </form>
        </DialogContent>
      </Dialog>
      {state.message && <p role="alert" className="max-w-sm text-right text-xs leading-5 text-red-400">{state.message}</p>}
    </div>
  );
}
