"use client";

import { useActionState } from "react";
import { LoaderCircle, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startResearchAction, type ResearchActionState } from "@/app/projects/[projectId]/research/actions";

const initialState: ResearchActionState = { message: null };

export function ResearchAction({ projectId, retry = false }: { projectId: string; retry?: boolean }) {
  const [state, formAction, pending] = useActionState(startResearchAction, initialState);
  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <><LoaderCircle className="h-4 w-4 animate-spin" />正在调研并分析...</> : retry ? <><RefreshCw className="h-4 w-4" />重新调研</> : <><Search className="h-4 w-4" />开始产品调研</>}
      </Button>
      {state.message && <p role="alert" className="max-w-sm text-right text-xs leading-5 text-red-600">{state.message}</p>}
    </form>
  );
}
