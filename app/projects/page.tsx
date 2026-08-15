import Link from "next/link";
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, Plus, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ProductLogo } from "@/components/product-logo";
import { getProjects } from "@/lib/mock/services";
import type { ProjectStatus } from "@/lib/types/project";

const statusLabels: Record<ProjectStatus, string> = {
  draft: "草稿", researching: "调研中", research_ready: "调研完成", protocol_draft: "方案草稿", protocol_locked: "方案已锁定", testing: "测试进行中", reviewing: "复核中", review_locked: "评分已锁定", completed: "已完成", reported: "报告已生成", published: "发布包已生成",
};

export default function ProjectsPage() {
  const projects = getProjects("demo");
  const activeCount = projects.filter((project) => !["completed", "reported", "published"].includes(project.status)).length;
  const completedCount = projects.length - activeCount;
  const productCount = new Set(projects.flatMap((project) => project.products.map((product) => product.id))).size;
  return (
    <div className="page-shell">
      <PageHeader title="AI 产品测评" description="设计可复现的测试方案，公平比较 AI 产品，并沉淀完整测评证据。" action={<Button asChild><Link href="/projects/new"><Plus className="h-4 w-4" />新建测评</Link></Button>} />
      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard icon={Clock3} label="进行中" value={activeCount} />
        <MetricCard icon={CheckCircle2} label="已完成" value={completedCount} />
        <MetricCard icon={Users} label="已测产品" value={productCount} />
      </section>
      <section className="mt-9">
        <div className="mb-4 flex items-center justify-between"><h2 className="section-title">最近测评项目</h2><span className="text-xs text-muted-foreground">共 {projects.length} 个项目</span></div>
        {projects.map((project) => (
          <Card key={project.id} className="group overflow-hidden shadow-none transition-colors hover:border-slate-300">
            <Link href={`/projects/${project.id}/test`} className="block p-5 sm:p-6">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-3"><h3 className="text-[17px] font-semibold tracking-tight">{project.name}</h3><Badge variant="warning"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />{statusLabels[project.status]}</Badge></div><div className="mt-4 flex flex-wrap items-center gap-4"><div className="flex -space-x-1.5">{project.products.map((product) => <ProductLogo key={product.id} initials={product.initials} name={product.name} className="h-7 w-7 rounded-md text-[10px] ring-2 ring-white" />)}</div><span className="text-xs text-muted-foreground">{project.products.map((product) => product.name).join(" · ")}</span><span className="flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />{project.createdAt}</span></div></div>
                <div className="w-full lg:w-64"><div className="mb-2 flex justify-between text-xs"><span className="text-muted-foreground">测试进度</span><span className="font-medium tabular-nums">{project.progress.completed} / {project.progress.total}</span></div><Progress value={project.progress.percent} /></div>
                <span className="grid h-9 w-9 place-items-center rounded-full border text-muted-foreground transition-all group-hover:border-blue-200 group-hover:bg-blue-50 group-hover:text-blue-700"><ArrowRight className="h-4 w-4" /></span>
              </div>
            </Link>
          </Card>
        ))}
      </section>
      <section className="subtle-grid mt-8 flex items-center justify-between rounded-lg border border-dashed p-5"><div><p className="text-sm font-medium">准备比较新的 AI 产品？</p><p className="mt-1 text-xs text-muted-foreground">从 1–3 个产品开始，AI 会帮你建立公平的测试框架。</p></div><Button variant="outline" size="sm" asChild><Link href="/projects/new">创建项目</Link></Button></section>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: number }) { return <Card className="p-4 shadow-none"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div><div className="mt-3 text-2xl font-semibold tabular-nums">{value}</div></Card>; }
