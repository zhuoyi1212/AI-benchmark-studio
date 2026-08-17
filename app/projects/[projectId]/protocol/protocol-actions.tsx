"use client";

import { useActionState } from "react";
import { LoaderCircle, LockKeyhole, RefreshCw, Sparkles } from "lucide-react";
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
  type ProtocolActionState,
} from "@/app/projects/[projectId]/protocol/actions";

const initialState: ProtocolActionState = { message: null };

export function GenerateProtocolAction({ projectId, regenerate = false }: { projectId: string; regenerate?: boolean }) {
  const [state, formAction, pending] = useActionState(generateProtocolAction, initialState);
  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <Button type="submit" size={regenerate ? "default" : "lg"} variant={regenerate ? "outline" : "default"} disabled={pending}>
        {pending ? <><LoaderCircle className="h-4 w-4 animate-spin" />正在生成 Protocol...</> : regenerate ? <><RefreshCw className="h-4 w-4" />重新生成新版本</> : <><Sparkles className="h-4 w-4" />生成测评方案</>}
      </Button>
      {state.message && <p role="alert" className="max-w-sm text-right text-xs leading-5 text-red-600">{state.message}</p>}
    </form>
  );
}

export function LockProtocolAction({ projectId, protocolId, testCaseCount, rubricCount }: {
  projectId: string;
  protocolId: string;
  testCaseCount: number;
  rubricCount: number;
}) {
  const [state, formAction, pending] = useActionState(lockProtocolAction, initialState);
  return (
    <div className="flex flex-col items-end gap-2">
      <Dialog>
        <DialogTrigger asChild>
          <Button size="lg" className="w-full bg-white text-slate-950 hover:bg-slate-100 sm:w-auto">
            <LockKeyhole className="h-4 w-4" />确认并锁定测评方案
          </Button>
        </DialogTrigger>
        <DialogContent>
          <div className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-amber-50 text-amber-700"><LockKeyhole className="h-5 w-5" /></div>
          <DialogTitle>确认锁定当前 Protocol？</DialogTitle>
          <DialogDescription>
            锁定后，本版本的 {testCaseCount} 个 Test Cases、全部 Prompt 和 {rubricCount} 个 Rubric 维度均不可原地修改，以保证测试公平。需要调整时只能生成新版本。
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
