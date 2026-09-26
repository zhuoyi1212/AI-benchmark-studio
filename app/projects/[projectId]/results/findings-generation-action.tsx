"use client";

import { useActionState, useEffect, useRef } from "react";
import { LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { generateFindingsAction, type ResultAnalysisActionState } from "@/app/projects/[projectId]/results/actions";
import { Button } from "@/components/ui/button";

const initialState: ResultAnalysisActionState = { message: null };

export function FindingsGenerationAction({ projectId, retry = false, autoStart = false }: { projectId: string; retry?: boolean; autoStart?: boolean }) {
  const [state, action, pending] = useActionState(generateFindingsAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const attemptedRef = useRef(false);
  useEffect(() => {
    if (!autoStart || attemptedRef.current) return;
    attemptedRef.current = true;
    formRef.current?.requestSubmit();
  }, [autoStart]);
  return <form ref={formRef} action={action} className="flex flex-col items-center gap-2">
    <input type="hidden" name="projectId" value={projectId} />
    <Button type="submit" size="lg" disabled={pending} onClick={() => { attemptedRef.current = true; }}>
      {pending ? <><LoaderCircle className="h-4 w-4 animate-spin" />正在提炼测评发现...</>
        : retry ? <><RefreshCw className="h-4 w-4" />重新提炼测评发现</>
          : <><Sparkles className="h-4 w-4" />从真实测试提炼 Findings</>}
    </Button>
    {state.message && <p role="alert" className="max-w-md text-center text-xs leading-5 text-red-600">{state.message}</p>}
  </form>;
}
