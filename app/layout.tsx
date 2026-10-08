import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import { Toaster } from "sonner";
import { AppShell } from "@/components/app-shell";
import { RecentProjectNav, RecentProjectNavSkeleton } from "@/components/recent-project-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Benchmark Studio",
  description: "专业的 AI 产品测评工作台",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const readOnly = (await headers()).get("x-ai-benchmark-access") !== "admin";

  return (
    <html lang="zh-CN">
      <body>
        <AppShell readOnly={readOnly} recentProject={<Suspense fallback={<RecentProjectNavSkeleton />}><RecentProjectNav /></Suspense>}>{children}</AppShell>
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
