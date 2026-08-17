"use client";

import { useActionState } from "react";
import { LoaderCircle, RefreshCw, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runBlindJudgeAction, type JudgeActionState } from "@/app/projects/[projectId]/review/actions";

const initialState: JudgeActionState = { message: null };

export function RunBlindJudgeAction({ projectId, retry = false }: { projectId: string; retry?: boolean }) {
  const [state, formAction, pending] = useActionState(runBlindJudgeAction, initialState);
  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <><LoaderCircle className="h-4 w-4 animate-spin" />正在进行 Blind Judge...</> : retry ? <><RefreshCw className="h-4 w-4" />重新运行 AI Judge</> : <><Scale className="h-4 w-4" />开始 AI Blind Judge</>}
      </Button>
      {state.message && <p role="alert" className="max-w-sm text-right text-xs leading-5 text-red-600">{state.message}</p>}
    </form>
  );
}
