import Link from "next/link";
import { ArrowRight, Award, Check, Crown, FileText, Minus, Sparkles, Users2, X } from "lucide-react";
import { WorkflowSteps } from "@/components/workflow-steps";
import { PageHeader } from "@/components/page-header";
import { ProductLogo } from "@/components/product-logo";
import { ScoreBar } from "@/components/score-bar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { productScores, products, rubrics } from "@/lib/mock-data";

const summaries = [
  { product: "Gamma", initials: "G", win: "生成速度与叙事结构最均衡", pros: ["内容结构完整", "首次生成质量高"], cons: ["精细排版自由度一般"], best: "追求快速交付的产品、咨询与创业团队", avoid: "需要像素级品牌控制的设计团队" },
  { product: "Canva", initials: "C", win: "视觉与编辑能力最突出", pros: ["模板与素材丰富", "后期编辑灵活"], cons: ["复杂数据洞察偏弱"], best: "重视视觉表现与持续编辑的市场团队", avoid: "希望一次生成直接完成复杂分析的用户" },
  { product: "Beautiful.ai", initials: "B", win: "版式稳定，品牌一致性可靠", pros: ["智能布局稳定", "企业风格统一"], cons: ["内容生成较保守", "编辑限制较多"], best: "强调规范与一致性的销售和企业团队", avoid: "需要自由创作和复杂定制的用户" },
];

export default function ResultsPage() {
  return (
    <div className="page-shell">
      <WorkflowSteps current={4} />
      <PageHeader eyebrow="项目 / AI PPT 产品横向测评" title="最终结果" description="AI Judge 评分已经过人工确认，以下结果来自统一协议下的 12 项测试。" action={<Badge variant="success"><Check className="h-3 w-3" />已完成</Badge>} />

      <section className="relative overflow-hidden rounded-xl border border-blue-200 bg-white p-7 shadow-soft">
        <div className="absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_center,_rgba(37,99,235,.1),transparent_65%)]" />
        <div className="relative flex flex-col justify-between gap-7 sm:flex-row sm:items-end"><div><div className="eyebrow text-blue-600">综合冠军</div><div className="mt-4 flex items-center gap-4"><ProductLogo initials="G" name="Gamma" className="h-14 w-14 rounded-xl text-xl" /><div><h2 className="text-3xl font-semibold tracking-[-.04em]">Gamma</h2><p className="mt-1 text-sm text-muted-foreground">最适合快速制作商业汇报</p></div></div></div><div className="flex items-end gap-3"><Crown className="mb-2 h-6 w-6 text-amber-500" /><div className="text-6xl font-semibold tracking-[-.06em] text-blue-700">8.7</div><div className="mb-2 text-xs text-muted-foreground">/ 10</div></div></div>
      </section>

      <section className="mt-8"><div className="mb-4 flex items-center justify-between"><h2 className="section-title">维度表现</h2><span className="text-xs text-muted-foreground">加权平均分 · 满分 10</span></div><Card className="overflow-x-auto p-5 shadow-none"><div className="min-w-[720px]"><div className="grid grid-cols-[160px_repeat(6,1fr)] gap-4 border-b pb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"><span>产品 / 综合分</span>{rubrics.map((item) => <span key={item.name} className="text-center">{item.name}</span>)}</div>{productScores.map((row, index) => <div key={row.name} className="grid grid-cols-[160px_repeat(6,1fr)] items-center gap-4 border-b py-4 last:border-0"><div className="flex items-center gap-3"><span className={`grid h-6 w-6 place-items-center rounded-full text-[10px] font-semibold ${index === 0 ? "bg-blue-600 text-white" : "bg-slate-100"}`}>{index + 1}</span><div><div className="text-sm font-semibold">{row.name}</div><div className="text-xs font-semibold text-blue-700">{row.score.toFixed(1)}</div></div></div>{row.values.map((value, valueIndex) => <div key={valueIndex} className="text-center"><div className="text-sm font-semibold tabular-nums">{value.toFixed(1)}</div><div className="mx-auto mt-1.5 h-1 w-12 overflow-hidden rounded-full bg-slate-100"><div className={row.color + " h-full rounded-full"} style={{ width: `${value * 10}%` }} /></div></div>)}</div>)}</div></Card></section>

      <section className="mt-8 grid gap-4 xl:grid-cols-3">{summaries.map((item, index) => <Card key={item.product} className="p-5 shadow-none"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><ProductLogo initials={item.initials} name={item.product} className="h-9 w-9" /><div><h3 className="text-sm font-semibold">{item.product}</h3><span className="text-xs text-muted-foreground">#{index + 1} · {productScores[index].score.toFixed(1)}</span></div></div>{index === 0 && <Award className="h-5 w-5 text-amber-500" />}</div><p className="mt-4 border-y py-3 text-xs font-medium leading-5">{item.win}</p><InfoList icon={Check} label="优势" items={item.pros} color="text-emerald-600" /><InfoList icon={X} label="劣势" items={item.cons} color="text-red-500" /><div className="mt-4 space-y-3 rounded-md bg-slate-50 p-3"><div><div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground"><Users2 className="h-3 w-3" />最适合</div><p className="mt-1 text-[11px] leading-5">{item.best}</p></div><div><div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground"><Minus className="h-3 w-3" />不适合</div><p className="mt-1 text-[11px] leading-5">{item.avoid}</p></div></div></Card>)}</section>

      <section className="mt-8 flex flex-col items-center rounded-xl border bg-slate-950 px-6 py-8 text-center text-white"><Sparkles className="h-5 w-5 text-blue-400" /><h2 className="mt-3 text-xl font-semibold">把测试结果变成可发布的深度报告</h2><p className="mt-2 max-w-lg text-xs leading-6 text-slate-400">包含完整方法、原始 Prompt、逐项证据与使用建议。</p><Button className="mt-5 bg-white text-slate-950 hover:bg-slate-100" asChild><Link href="/projects/demo/report"><FileText className="h-4 w-4" />生成深度报告<ArrowRight className="h-4 w-4" /></Link></Button></section>
    </div>
  );
}

function InfoList({ icon: Icon, label, items, color }: { icon: typeof Check; label: string; items: string[]; color: string }) { return <div className="mt-4"><div className="eyebrow">{label}</div><ul className="mt-2 space-y-1.5">{items.map((item) => <li key={item} className="flex gap-2 text-xs text-slate-600"><Icon className={`mt-0.5 h-3 w-3 ${color}`} />{item}</li>)}</ul></div>; }

