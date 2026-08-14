import Link from "next/link";
import { ArrowRight, Check, CheckCircle2, CircleDollarSign, Sparkles, Target, Users } from "lucide-react";
import { WorkflowSteps } from "@/components/workflow-steps";
import { PageHeader } from "@/components/page-header";
import { ProductLogo } from "@/components/product-logo";
import { MockLoader } from "@/components/mock-loader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { mockProject } from "@/lib/mock/project.mock";
import { mockResearchResponse } from "@/lib/mock/research.mock";

const comparabilityLabels = { comparable: "适合横向测试", partially_comparable: "部分适合横向测试", not_comparable: "不建议横向测试" };

export default function ResearchPage() {
  const research = mockResearchResponse;
  return <div className="page-shell">
    <MockLoader label="正在分析产品共同能力..." />
    <WorkflowSteps current={0} />
    <PageHeader eyebrow={`项目 / ${mockProject.name}`} title="产品调研" description="基于公开定位与产品能力形成的 Mock 调研摘要。" action={<Button asChild><Link href="/projects/demo/protocol">生成测评方案<ArrowRight className="h-4 w-4" /></Link></Button>} />
    <Card className="mb-8 overflow-hidden border-emerald-200 bg-emerald-50/50 shadow-none"><div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-emerald-600 ring-1 ring-emerald-200"><CheckCircle2 className="h-5 w-5" /></span><div className="flex-1"><div className="flex items-center gap-2"><h2 className="section-title">可比性判断</h2><Badge variant="success">{comparabilityLabels[research.comparability.status]}</Badge></div><p className="mt-2 text-sm leading-6 text-slate-700">{research.comparability.reason}</p></div>{research.comparability.score !== undefined && <div className="min-w-40 border-t border-emerald-200 pt-4 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0"><div className="text-[11px] text-muted-foreground">可比性置信度</div><div className="mt-1 text-2xl font-semibold text-emerald-700">{Math.round(research.comparability.score * 100)}%</div></div>}</div></Card>
    <section><div className="mb-4 flex items-center justify-between"><h2 className="section-title">产品概览</h2><span className="text-xs text-muted-foreground">{research.products.length} 个产品</span></div><div className="grid gap-4 xl:grid-cols-3">{research.products.map((product) => <Card key={product.productId} className="p-5 shadow-none"><div className="flex items-center gap-3"><ProductLogo initials={product.initials} name={product.name} /><div><h3 className="font-semibold">{product.name}</h3><p className="mt-0.5 text-xs text-muted-foreground">{product.positioning}</p></div></div><div className="mt-5 space-y-4 border-t pt-4"><Info icon={Sparkles} label="核心能力"><div className="flex flex-wrap gap-1.5">{product.capabilities.map((item) => <Badge key={item} variant="neutral">{item}</Badge>)}</div></Info><Info icon={Users} label="目标用户"><p>{product.targetUsers.join("、")}</p></Info><Info icon={CircleDollarSign} label="方案与价格"><p>{product.pricing?.freePlan ?? "未提供免费方案信息"}</p><p className="text-foreground">{product.pricing?.summary ?? "价格待确认"}</p></Info><Info icon={Target} label="主要特点"><ul className="space-y-1">{product.keyFeatures.map((feature) => <li key={feature} className="flex items-center gap-1.5"><Check className="h-3 w-3 text-emerald-600" />{feature}</li>)}</ul></Info></div></Card>)}</div></section>
    <section className="mt-8 rounded-lg border bg-white p-5"><h2 className="section-title">共同测试能力</h2><p className="mt-1 text-xs text-muted-foreground">下列能力可以使用相同任务和输入进行公平比较。</p><div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{research.comparability.commonCapabilities.map((ability, index) => <div key={ability} className="flex items-center gap-2 rounded-md border bg-slate-50 px-3 py-3 text-sm font-medium"><span className="grid h-5 w-5 place-items-center rounded-full bg-blue-100 text-[10px] font-semibold text-blue-700">{index + 1}</span>{ability}</div>)}</div></section>
    <div className="sticky bottom-5 z-20 mt-8 flex justify-end rounded-lg border bg-white/90 p-3 shadow-lg backdrop-blur"><Button size="lg" asChild><Link href="/projects/demo/protocol">生成测评方案<ArrowRight className="h-4 w-4" /></Link></Button></div>
  </div>;
}

function Info({ icon: Icon, label, children }: { icon: typeof Sparkles; label: string; children: React.ReactNode }) { return <div className="grid grid-cols-[88px_1fr] gap-3 text-xs leading-5 text-muted-foreground"><div className="flex items-start gap-1.5 font-medium text-slate-500"><Icon className="mt-0.5 h-3.5 w-3.5" />{label}</div><div>{children}</div></div>; }
