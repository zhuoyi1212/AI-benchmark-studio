"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh({ intervalMs = 15000, maxRefreshes }: { intervalMs?: number; maxRefreshes?: number }) {
  const router = useRouter();
  const [refreshes, setRefreshes] = useState(0);
  useEffect(() => {
    if (maxRefreshes !== undefined && refreshes >= maxRefreshes) return;
    const timer = window.setTimeout(() => {
      setRefreshes((value) => value + 1);
      router.refresh();
    }, intervalMs);
    return () => window.clearTimeout(timer);
  }, [intervalMs, maxRefreshes, refreshes, router]);
  return null;
}
