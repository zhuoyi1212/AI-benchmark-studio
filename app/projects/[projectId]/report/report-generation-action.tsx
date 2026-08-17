"use client";

import { useActionState } from "react";
import { FileText, LoaderCircle, RefreshCw } from "lucide-react";
import { generateReportAction, type ReportActionState } from "@/app/projects/[projectId]/report/actions";
import { Button } from "@/components/ui/button";

const initialState: ReportActionState = { message: null };

export function ReportGenerationAction({ projectId, retry = false }: { projectId: string; retry?: boolean }) {
  const [state, action, pending] = useActionState(generateReportAction, initialState);
  return <form action={action} className="flex flex-col items-center gap-2"><input type="hidden" name="projectId" value={projectId} /><Button type="submit" size="lg" disabled={pending}>{pending ? <><LoaderCircle className="h-4 w-4 animate-spin" />正在组织报告与证据...</> : retry ? <><RefreshCw className="h-4 w-4" />重新生成深度报告</> : <><FileText className="h-4 w-4" />生成深度报告</>}</Button>{state.message && <p role="alert" className="max-w-md text-center text-xs leading-5 text-red-600">{state.message}</p>}</form>;
}
