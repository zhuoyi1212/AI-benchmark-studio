"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { mockWorkflow } from "@/lib/mock/project.mock";
import { cn } from "@/lib/utils";

export function WorkflowSteps({ current }: { current: number }) {
  return (
    <div className="mb-8 overflow-x-auto border-b">
      <div className="flex min-w-[760px] items-center">
        {mockWorkflow.map((step, index) => (
          <Link key={step.href} href={step.href} className={cn("relative flex flex-1 items-center gap-2 border-b-2 border-transparent px-1 pb-3 text-xs text-muted-foreground transition-colors hover:text-foreground", index === current && "border-blue-600 font-semibold text-blue-700", index < current && "text-slate-600")}>
            <span className={cn("grid h-5 w-5 place-items-center rounded-full border text-[10px]", index === current && "border-blue-600 bg-blue-600 text-white", index < current && "border-emerald-200 bg-emerald-50 text-emerald-700")}>
              {index < current ? <Check className="h-3 w-3" /> : index + 1}
            </span>{step.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
