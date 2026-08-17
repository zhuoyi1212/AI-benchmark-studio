"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const workflowSteps = [
  ["research", "产品调研"], ["protocol", "测评方案"], ["test", "测试执行"], ["review", "盲评"],
  ["results", "结果"], ["report", "报告"], ["publish", "发布包"],
] as const;

export function WorkflowSteps({ current, projectId }: { current: number; projectId?: string }) {
  const pathname = usePathname();
  const resolvedProjectId = projectId ?? pathname.match(/^\/projects\/([^/]+)\//)?.[1];
  if (!resolvedProjectId) return null;
  const workflow = workflowSteps.map(([segment, label]) => ({ label, href: `/projects/${resolvedProjectId}/${segment}` }));
  const activeStep = Math.min(current, workflow.length - 1);
  return (
    <div className="mb-8 overflow-x-auto border-b">
      <div className="flex min-w-[760px] items-center">
        {workflow.map((step, index) => (
          <Link key={step.href} href={step.href} className={cn("relative flex flex-1 items-center gap-2 border-b-2 border-transparent px-1 pb-3 text-xs text-muted-foreground transition-colors hover:text-foreground", index === activeStep && "border-blue-600 font-semibold text-blue-700", index < activeStep && "text-slate-600")}>
            <span className={cn("grid h-5 w-5 place-items-center rounded-full border text-[10px]", index === activeStep && "border-blue-600 bg-blue-600 text-white", index < activeStep && "border-emerald-200 bg-emerald-50 text-emerald-700")}>
              {index < activeStep ? <Check className="h-3 w-3" /> : index + 1}
            </span>{step.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
