import { cn } from "@/lib/utils";

export function ScoreBar({ value, color = "bg-blue-600", compact = false }: { value: number; color?: string; compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn("h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100", compact && "h-1")}><div className={cn("h-full rounded-full", color)} style={{ width: `${value * 10}%` }} /></div>
      <span className="w-7 text-right text-xs font-semibold tabular-nums">{value.toFixed(1)}</span>
    </div>
  );
}

