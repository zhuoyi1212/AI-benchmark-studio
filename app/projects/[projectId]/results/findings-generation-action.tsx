"use client";

import { useActionState } from "react";
import { LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { generateFindingsAction, type ResultAnalysisActionState } from "@/app/projects/[projectId]/results/actions";
import { Button } from "@/components/ui/button";

const initialState: ResultAnalysisActionState = { message: null };

export function FindingsGenerationAction({ projectId, retry = false }: { projectId: string; retry?: boolean }) {
  const [state, action, pending] = useActionState(generateFindingsAction, initialState);
  return <form action={action} className="flex flex-col items-center gap-2">
    <input type="hidden" name="projectId" value={projectId} />
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? <><LoaderCircle className="h-4 w-4 animate-spin" />正在读取原始证据...</>
        : retry ? <><RefreshCw className="h-4 w-4" />重新提炼测评发现</>
          : <><Sparkles className="h-4 w-4" />从真实测试提炼 Findings</>}
    </Button>
    {state.message && <p role="alert" className="max-w-md text-center text-xs leading-5 text-red-600">{state.message}</p>}
  </form>;
}
