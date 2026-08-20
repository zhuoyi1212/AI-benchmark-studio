import { ArrowLeft, ArrowRight, Check, CheckCircle2, CircleDollarSign, ExternalLink, FlaskConical, LoaderCircle, Sparkles, Target, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { ProductLogo } from "@/components/product-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ResearchAction } from "@/app/projects/[projectId]/research/research-action";
import { getProjectMode, type ProjectMode } from "@/lib/project-mode";
import { getResearchWorkspace } from "@/lib/services/research.service";
import type { ComparabilityResult, ProductResearch, ResearchSource } from "@/lib/types/research";

export const maxDuration = 300;

type ResearchPageProps = { params: Promise<{ projectId: string }> };

const comparabilityLabels: Record<ComparabilityResult["status"], string> = {
  comparable: "适合横向测试",
  partially_comparable: "部分适合横向测试",
  not_comparable: "不建议横向测试",
};

const sourceTypeLabels: Record<ResearchSource["sourceType"], string> = {
  official_website: "官网",
  documentation: "文档",
  pricing: "价格",
  help_center: "帮助中心",
  blog: "文章",
  other: "来源",
};

export default async function ResearchPage({ params }: ResearchPageProps) {
  await connection();
  const { projectId } = await params;
  const workspace = await getResearchWorkspace(projectId);
  if (!workspace) notFound();

  const { project, latestRun, completedResult, runCount } = workspace;
  const projectMode = getProjectMode(project.products);
  const running = latestRun?.status === "pending" || latestRun?.status === "running";
  const latestFailed = latestRun?.status === "failed";

  return (
    <div className="page-shell">
      <Link href="/projects" className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />返回我的测评</Link>
      <PageHeader
        eyebrow={`项目 / ${project.name}`}
        title="产品调研"
        description={completedResult ? `ResearchRun v${completedResult.version} · 基于真实检索来源形成的结构化调研。` : projectMode === "single" ? "基于官方来源建立产品事实，再提炼值得真实体验验证的核心能力。" : "基于官网、文档、价格页与官方动态收集可追溯事实，再判断产品是否适合横向测试。"}
        action={!completedResult && !running ? <ResearchAction projectId={project.id} retry={latestFailed} /> : undefined}
      />

      {running && <StatusBanner icon={LoaderCircle} title="正在调研产品" description={projectMode === "single" ? "正在检索真实来源、整理定位、能力、卖点、限制与值得体验的场景。刷新页面可查看最新状态。" : "正在检索真实来源、整理结构化产品信息并分析可比性。刷新页面可查看最新状态。"} spinning />}
      {latestFailed && <StatusBanner icon={FlaskConical} title={`ResearchRun v${latestRun.version} 未完成`} description={latestRun.error_message ?? "调研执行失败，可创建新的 ResearchRun 重试；历史运行不会被覆盖。"} error />}
      {runCount > 1 && <p className="mb-5 text-xs text-muted-foreground">已保留 {runCount} 次 ResearchRun 历史；当前展示最近一次成功结果。</p>}

      {completedResult ? (
        <>
          <ComparabilityCard comparability={completedResult.comparability} mode={projectMode} />
          <section>
            <div className="mb-4 flex items-center justify-between"><h2 className="section-title">产品概览</h2><span className="text-xs text-muted-foreground">{completedResult.products.length} 个产品</span></div>
            <div className="grid gap-4 xl:grid-cols-3">{completedResult.products.map((product) => <ProductResearchCard key={product.productId} product={product} />)}</div>
          </section>
          <section className="mt-8 rounded-lg border bg-white p-5">
            <h2 className="section-title">{projectMode === "single" ? "核心体验能力" : "共同测试能力"}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{projectMode === "single" ? "下列能力来自已保存的 ProductResearch，将用于设计可留证的真实体验任务。" : "下列能力来自已保存的 ProductResearch，可使用共同任务进行比较。"}</p>
            {completedResult.comparability.commonCapabilities.length > 0 ? <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{completedResult.comparability.commonCapabilities.map((ability, index) => <div key={ability} className="flex items-center gap-2 rounded-md border bg-slate-50 px-3 py-3 text-sm font-medium"><span className="grid h-5 w-5 place-items-center rounded-full bg-blue-100 text-[10px] font-semibold text-blue-700">{index + 1}</span>{ability}</div>)}</div> : <p className="mt-4 text-sm text-muted-foreground">{projectMode === "single" ? "暂未识别到明确的核心体验能力。" : "没有识别到足以支持标准化横向测试的共同能力。"}</p>}
            {completedResult.comparability.warnings?.length ? <ul className="mt-5 space-y-1.5 border-t pt-4 text-xs leading-5 text-amber-800">{completedResult.comparability.warnings.map((warning) => <li key={warning}>· {warning}</li>)}</ul> : null}
          </section>
          <div className="sticky bottom-5 z-20 mt-8 flex items-center justify-between rounded-lg border bg-white/95 p-3 shadow-lg backdrop-blur">
            <div className="text-xs text-muted-foreground">调研完成于 {formatDateTime(completedResult.generatedAt)}</div>
            <div className="flex items-center gap-2"><ResearchAction projectId={project.id} retry />{projectMode === "comparison" && completedResult.comparability.status === "not_comparable" ? <Button size="lg" disabled>暂不支持生成方案</Button> : <Button size="lg" asChild><Link href={`/projects/${project.id}/protocol`}>生成{projectMode === "single" ? "体验" : "测评"}方案<ArrowRight className="h-4 w-4" /></Link></Button>}</div>
          </div>
        </>
      ) : !running ? (
        <section className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div><h2 className="section-title">待调研产品</h2><div className="mt-3 space-y-3">{project.products.map((product, index) => <Card key={product.id} className="flex items-center gap-4 p-5 shadow-none"><ProductLogo initials={product.initials} name={product.name} /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-[11px] font-medium text-muted-foreground">{String(index + 1).padStart(2, "0")}</span><h3 className="font-semibold">{product.name}</h3></div>{product.officialUrl ? <a href={product.officialUrl} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex max-w-full items-center gap-1 truncate text-xs text-blue-700 hover:underline">{product.officialUrl}<ExternalLink className="h-3 w-3 shrink-0" /></a> : <p className="mt-1.5 text-xs text-muted-foreground">未提供官网，将通过搜索识别官方来源。</p>}</div><Badge variant="outline">未开始</Badge></Card>)}</div></div>
          <aside className="h-fit rounded-lg border bg-slate-50 p-5"><div className="flex items-center gap-2"><FlaskConical className="h-4 w-4 text-blue-700" /><h2 className="text-sm font-semibold">{projectMode === "single" ? "体验目标" : "测评目标"}</h2></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{project.intent}</p><div className="mt-5 border-t pt-4"><p className="text-xs leading-5 text-muted-foreground">调研失败会明确记录为 failed，并允许创建新版本重试；不会显示 Mock 结果。</p></div></aside>
        </section>
      ) : null}
    </div>
  );
}

function ComparabilityCard({ comparability, mode }: { comparability: ComparabilityResult; mode: ProjectMode }) {
  const positive = mode === "single" || comparability.status === "comparable";
  const label = mode === "single" ? "体验范围已识别" : comparabilityLabels[comparability.status];
  return <Card className={`mb-8 overflow-hidden shadow-none ${positive ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/50"}`}><div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white ring-1 ${positive ? "text-emerald-600 ring-emerald-200" : "text-amber-700 ring-amber-200"}`}><CheckCircle2 className="h-5 w-5" /></span><div className="flex-1"><div className="flex items-center gap-2"><h2 className="section-title">{mode === "single" ? "体验范围判断" : "可比性判断"}</h2><Badge variant={positive ? "success" : "warning"}>{label}</Badge></div><p className="mt-2 text-sm leading-6 text-slate-700">{comparability.reason}</p></div>{comparability.score !== undefined && <div className={`min-w-40 border-t pt-4 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0 ${positive ? "border-emerald-200" : "border-amber-200"}`}><div className="text-[11px] text-muted-foreground">{mode === "single" ? "分析置信度" : "可比性置信度"}</div><div className={`mt-1 text-2xl font-semibold ${positive ? "text-emerald-700" : "text-amber-800"}`}>{Math.round(comparability.score * 100)}%</div></div>}</div></Card>;
}

function ProductResearchCard({ product }: { product: ProductResearch }) {
  return <Card className="p-5 shadow-none"><div className="flex items-center gap-3"><ProductLogo initials={product.initials} name={product.name} /><div className="min-w-0"><h3 className="font-semibold">{product.name}</h3><p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{product.positioning}</p></div></div><div className="mt-5 space-y-4 border-t pt-4"><Info icon={Sparkles} label="核心能力"><div className="flex flex-wrap gap-1.5">{product.capabilities.map((item) => <Badge key={item} variant="neutral">{item}</Badge>)}</div></Info><Info icon={Users} label="目标用户"><p>{product.targetUsers.join("、")}</p></Info><Info icon={CircleDollarSign} label="方案与价格"><p>{product.pricing?.freePlan ?? "未确认免费方案"}</p><p className="text-foreground">{product.pricing?.summary ?? "价格信息不足"}</p></Info><Info icon={Target} label="主要特点"><ul className="space-y-1">{product.keyFeatures.map((feature) => <li key={feature} className="flex items-start gap-1.5"><Check className="mt-1 h-3 w-3 shrink-0 text-emerald-600" />{feature}</li>)}</ul></Info></div><div className="mt-5 border-t pt-4"><div className="mb-2 text-[11px] font-medium text-slate-500">事实来源 · {product.sources.length}</div><div className="flex flex-wrap gap-1.5">{product.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" title={source.title} className="inline-flex max-w-full items-center gap-1 rounded-full border bg-slate-50 px-2 py-1 text-[10px] text-slate-600 hover:border-blue-200 hover:text-blue-700"><span>{sourceTypeLabels[source.sourceType]}</span><ExternalLink className="h-2.5 w-2.5" /></a>)}</div></div></Card>;
}

function StatusBanner({ icon: Icon, title, description, error = false, spinning = false }: { icon: typeof LoaderCircle; title: string; description: string; error?: boolean; spinning?: boolean }) {
  return <div className={`mb-6 flex gap-3 rounded-lg border p-4 ${error ? "border-red-200 bg-red-50" : "border-blue-200 bg-blue-50"}`}><Icon className={`mt-0.5 h-4 w-4 shrink-0 ${error ? "text-red-600" : "text-blue-700"} ${spinning ? "animate-spin" : ""}`} /><div><div className="text-sm font-semibold">{title}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p></div></div>;
}

function Info({ icon: Icon, label, children }: { icon: typeof Sparkles; label: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[88px_1fr] gap-3 text-xs leading-5 text-muted-foreground"><div className="flex items-start gap-1.5 font-medium text-slate-500"><Icon className="mt-0.5 h-3.5 w-3.5" />{label}</div><div>{children}</div></div>;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
