"use client";

import { NavigationLink as Link } from "@/components/navigation-link";
import { usePathname } from "next/navigation";
import { Boxes, ChevronDown, Database, Eye, FlaskConical, LayoutDashboard, LockKeyhole, Menu, Settings, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const nav = [
  { label: "我的测评", href: "/projects", icon: LayoutDashboard },
  { label: "产品库", href: "/products", icon: Boxes },
];

export function AppShell({ children, recentProject, readOnly }: { children: React.ReactNode; recentProject: React.ReactNode; readOnly: boolean }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebar = (
    <aside className="flex h-full w-[248px] shrink-0 flex-col border-r bg-[#fbfbfc] px-3.5 py-4">
      <div className="flex items-center justify-between px-2 py-1">
        <Link href="/projects" className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-950 text-white"><FlaskConical className="h-4 w-4" /></span>
          <div><div className="text-sm font-semibold tracking-tight">AI Benchmark</div><div className="text-[10px] text-muted-foreground">STUDIO</div></div>
        </Link>
        <Button className="md:hidden" variant="ghost" size="icon" onClick={() => setMobileOpen(false)}><X className="h-4 w-4" /></Button>
      </div>

      <div className="mt-6 px-2 text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">AI 测评工作台</div>
      <nav className="mt-2 space-y-0.5">
        {nav.map((item) => {
          const active = pathname === item.href || (item.href === "/projects" && pathname.startsWith("/projects"));
          return (
            <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={cn("flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950", active && "bg-slate-100 text-slate-950")}>
              <item.icon className={cn("h-4 w-4", active ? "text-blue-600" : "text-slate-400")} />{item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-7 px-2 text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">最近项目</div>
      <div onClick={() => setMobileOpen(false)}>{recentProject}</div>

      <div className="mt-auto border-t pt-3">
        {readOnly ? (
          <a href="/admin" className="flex items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-slate-100">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-slate-500"><Eye className="h-3.5 w-3.5" /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">只读访客</span><span className="block truncate text-[10px] text-muted-foreground">登录后可编辑</span></span>
            <LockKeyhole className="h-3.5 w-3.5 text-muted-foreground" />
          </a>
        ) : <>
          <Link href="/settings" onClick={() => setMobileOpen(false)} className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-slate-600 hover:bg-slate-100"><Settings className="h-4 w-4 text-slate-400" />设置</Link>
          <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="mt-1 flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-slate-100">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">PM</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">产品经理</span><span className="block truncate text-[10px] text-muted-foreground">本地工作区</span></span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-52">
            <DropdownMenuItem><Database className="h-4 w-4 text-blue-600" />真实项目数据已启用</DropdownMenuItem>
          </DropdownMenuContent>
          </DropdownMenu>
        </>}
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen md:flex">
      <div className="fixed inset-y-0 left-0 z-40 hidden md:block">{sidebar}</div>
      {mobileOpen && <div className="fixed inset-0 z-50 flex md:hidden"><div className="absolute inset-0 bg-slate-950/20" onClick={() => setMobileOpen(false)} /> <div className="relative">{sidebar}</div></div>}
      <header className="sticky top-0 z-30 flex h-14 items-center border-b bg-white/90 px-4 backdrop-blur md:hidden">
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}><Menu className="h-5 w-5" /></Button>
        <span className="ml-2 text-sm font-semibold">AI Benchmark Studio</span>
      </header>
      <main className="min-w-0 flex-1 md:ml-[248px]">
        {readOnly && <div className="flex min-h-10 items-center justify-between gap-4 border-b border-blue-100 bg-blue-50 px-5 py-2 text-xs text-blue-950 lg:px-10"><span>只读浏览 · 内容可查看，修改与 AI 操作需要管理员登录</span><a href="/admin" className="shrink-0 font-semibold text-blue-700 hover:text-blue-900">管理员登录</a></div>}
        {children}
      </main>
    </div>
  );
}
