"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ProjectsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[Projects] Page load failed", error); }, [error]);
  return <div className="page-shell" role="alert">
    <h1 className="text-xl font-semibold">页面暂时未能加载</h1>
    <p className="mt-3 text-sm text-muted-foreground">连接可能中断，请重试。</p>
    <Button className="mt-5" onClick={reset}><RefreshCw className="h-4 w-4" />重新加载</Button>
  </div>;
}
