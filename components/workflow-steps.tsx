"use client";

import Link from "next/link";
import { Check, LockKeyhole } from "lucide-react";
import { usePathname } from "next/navigation";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ProjectWorkflowState, WorkflowStageId } from "@/lib/types/workflow-navigation";
import { cn } from "@/lib/utils";

const workflowSteps = [
  ["research", "产品调研"], ["protocol", "测评方案"], ["test", "测试执行"], ["review", "盲评"],
  ["results", "结果"], ["report", "报告"], ["publish", "发布包"],
] as const;

export function WorkflowSteps({ projectId, workflowState }: { projectId: string; workflowState: ProjectWorkflowState }) {
  const pathname = usePathname();
  const activeStep = pathname.match(/^\/projects\/[^/]+\/([^/?#]+)/)?.[1] as WorkflowStageId | undefined;
  const workflow = workflowSteps.map(([segment, label]) => ({
    id: segment,
    label,
    href: `/projects/${projectId}/${segment}`,
    access: workflowState.stages[segment],
  }));
  return (
    <TooltipProvider delayDuration={250}>
      <nav aria-label="测评工作流" className="mb-8 overflow-x-auto border-b">
        <div className="flex min-w-[760px] items-center">
          {workflow.map((step, index) => {
            const active = step.id === activeStep;
            const content = <>
              <span className={cn(
                "grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px]",
                step.access.completed && !active && "border-emerald-200 bg-emerald-50 text-emerald-700",
                active && "border-blue-600 bg-blue-600 text-white",
                !step.access.accessible && "border-slate-200 bg-slate-50 text-slate-400",
              )}>
                {step.access.completed ? <Check className="h-3 w-3" /> : !step.access.accessible ? <LockKeyhole className="h-2.5 w-2.5" /> : index + 1}
              </span>
              <span>{step.label}</span>
              <span className="sr-only">{active ? "，当前页面" : ""}{step.access.completed ? "，已完成" : step.access.accessible ? "，可进入" : "，未解锁"}</span>
            </>;
            const className = cn(
              "relative flex flex-1 items-center gap-2 border-b-2 border-transparent px-1 pb-3 text-xs transition-colors",
              step.access.completed && !active && "text-slate-600 hover:text-emerald-700",
              step.access.accessible && !step.access.completed && !active && "text-slate-600 hover:text-foreground",
              active && "border-blue-600 font-semibold text-blue-700",
              !step.access.accessible && "cursor-not-allowed text-slate-300",
            );
            if (step.access.accessible) {
              return <Link key={step.id} href={step.href} aria-current={active ? "step" : undefined} className={className}>{content}</Link>;
            }
            return (
              <Tooltip key={step.id}>
                <TooltipTrigger asChild>
                  <span className={className} aria-disabled="true" tabIndex={0}>{content}</span>
                </TooltipTrigger>
                <TooltipContent>{step.access.lockedReason ?? "当前阶段尚未解锁"}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </nav>
    </TooltipProvider>
  );
}
