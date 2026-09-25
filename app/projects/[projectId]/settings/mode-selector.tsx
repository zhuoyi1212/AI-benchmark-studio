"use client";

import { useActionState, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { updateProjectModeAction, type ProjectSettingsActionState } from "@/app/projects/[projectId]/settings/actions";
import { Button } from "@/components/ui/button";
import type { EvaluationMode } from "@/lib/project-mode";

const initialState: ProjectSettingsActionState = { message: null };

export function ModeSelector({ projectId, initialMode, disabled }: { projectId: string; initialMode: EvaluationMode; disabled: boolean }) {
  const [mode, setMode] = useState(initialMode);
  const [state, action, pending] = useActionState(updateProjectModeAction, initialState);
  return <form action={action} className="space-y-4">
    <input type="hidden" name="projectId" value={projectId} />
    <input type="hidden" name="evaluationMode" value={mode} />
    <div className="grid grid-cols-2 rounded-lg border bg-slate-50 p-1" role="radiogroup" aria-label="测评模式">
      {(["quick", "professional"] as const).map((value) => <button key={value} type="button" role="radio" aria-checked={mode === value} disabled={disabled || pending} onClick={() => setMode(value)} className={`rounded-md px-3 py-2 text-sm font-medium ${mode === value ? "bg-white text-blue-700 shadow-sm" : "text-muted-foreground"}`}>{value === "quick" ? "快速模式" : "专业模式"}</button>)}
    </div>
    <p className="text-xs leading-5 text-muted-foreground">{mode === "quick" ? "1 个核心 Case，复用产品调研，上传完成后自动 Blind Judge，只处理异常评分。" : "2–4 个 Case，保留完整配置、逐项复核、结果分析和专业报告。"}</p>
    {disabled ? <p className="text-xs text-amber-700">Protocol 已锁定，当前项目模式不可修改。</p> : <Button type="submit" disabled={pending || mode === initialMode}>{pending ? <><LoaderCircle className="h-4 w-4 animate-spin" />保存中...</> : "保存模式"}</Button>}
    {state.message && <p role="alert" className="text-xs text-red-600">{state.message}</p>}
  </form>;
}
