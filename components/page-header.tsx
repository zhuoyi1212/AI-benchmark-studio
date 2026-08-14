import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PageHeader({ eyebrow, title, description, action, compact = false }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode; compact?: boolean }) {
  return (
    <header className={compact ? "mb-6" : "mb-9"}>
      {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0"><h1 className="text-[26px] font-semibold leading-tight tracking-[-0.035em] text-slate-950 sm:text-[30px]">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>}</div>
        <div className="flex shrink-0 items-center gap-2">{action}<Button aria-label="更多操作" variant="outline" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></div>
      </div>
    </header>
  );
}

