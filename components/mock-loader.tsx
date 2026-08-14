"use client";

import { LoaderCircle, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

export function MockLoader({ label, duration = 700 }: { label: string; duration?: number }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => { const timer = window.setTimeout(() => setVisible(false), duration); return () => window.clearTimeout(timer); }, [duration]);
  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-white/75 backdrop-blur-sm">
      <div className="flex min-w-72 items-center gap-3 rounded-xl border bg-white p-4 shadow-xl"><span className="relative grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-blue-600"><Sparkles className="h-4 w-4" /><LoaderCircle className="absolute h-8 w-8 animate-spin text-blue-200" /></span><div><p className="text-sm font-medium">{label}</p><p className="mt-0.5 text-xs text-muted-foreground">使用 Mock 数据生成演示结果</p></div></div>
    </div>
  );
}

