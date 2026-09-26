"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { LoaderCircle, ShieldCheck, Undo2 } from "lucide-react";
import { advanceQuickEvaluationAction, type TestExecutionActionState } from "@/app/projects/[projectId]/test/actions";
import { Button } from "@/components/ui/button";

const initialState: TestExecutionActionState = { ok: false, message: null };

export function QuickAutoAdvance({ projectId, protocolId, countdown = true }: { projectId: string; protocolId: string; countdown?: boolean }) {
  const [state, formAction, pending] = useActionState(advanceQuickEvaluationAction, initialState);
  const [seconds, setSeconds] = useState(countdown ? 5 : 0);
  const [cancelled, setCancelled] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (cancelled || pending) return;
    if (seconds <= 0) {
      if (attemptedRef.current) return;
      attemptedRef.current = true;
      formRef.current?.requestSubmit();
      return;
    }
    const timer = window.setTimeout(() => setSeconds((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cancelled, pending, seconds]);

  return <form ref={formRef} action={formAction} className="flex flex-col items-end gap-2">
    <input type="hidden" name="projectId" value={projectId} />
    <input type="hidden" name="protocolId" value={protocolId} />
    <div className="flex items-center gap-2">
      {!cancelled && !pending && <Button type="button" variant="ghost" onClick={() => setCancelled(true)}><Undo2 className="h-4 w-4" />撤销自动开始</Button>}
      <Button type="submit" size="lg" disabled={pending} onClick={() => { attemptedRef.current = true; }}>
        {pending ? <><LoaderCircle className="h-4 w-4 animate-spin" />正在匿名评分...</> : <><ShieldCheck className="h-4 w-4" />{cancelled ? "开始匿名分析" : `${seconds} 秒后自动分析`}</>}
      </Button>
    </div>
    {state.message && <p role="alert" className="max-w-sm text-right text-xs text-red-600">{state.message}</p>}
  </form>;
}
