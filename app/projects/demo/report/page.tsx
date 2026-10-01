"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Check, Clock3, Database, Download, FlaskConical, Quote, Send, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { ProductLogo } from "@/components/product-logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getReportWorkspace, REVIEW_STORAGE_KEY } from "@/lib/mock/services";
import type { ReportWorkspace } from "@/lib/mock/services";

const toc = ["TL;DR", "最终排名", "为什么测试", "我们怎么测试", "Case 复盘", "产品优缺点", "最终推荐", "测试限制"];

export default function ReportPage() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<ReportWorkspace | null>(null);
  useEffect(() => {
    const result = getReportWorkspace("demo", window.localStorage.getItem(REVIEW_STORAGE_KEY));
    if (!result.ok) { router.replace(result.redirectTo); return; }
    setWorkspace(result.data);
  }, [router]);
  if (!workspace) return null;
  const { project, protocol, report, reviewSummary } = workspace;
  return <div className="min-h-screen bg-white">
    <div className="border-b bg-[#fafafa]"><div className="mx-auto flex max-w-[1180px] items-center justify-between px-6 py-3 lg:px-10"><Link href="/projects/demo/results" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />返回结果</Link><div className="flex items-center gap-2"><Badge className="hidden sm:inline-flex" variant="success"><Check className="h-3 w-3" />报告已生成</Badge><Button variant="outline" size="sm"><Download className="h-3.5 w-3.5" />导出</Button><Button size="sm" asChild><Link href="/projects/demo/publish"><Send className="h-3.5 w-3.5" />生成社区内容</Link></Button></div></div></div>
    <article className="mx-auto max-w-[1180px] px-6 pb-20 pt-6 lg:px-10">
      <header className="max-w-4xl"><div className="eyebrow text-blue-600">{report.eyebrow}</div><h1 className="mt-3 text-2xl font-bold leading-[1.45] tracking-tight text-slate-950 sm:text-[28px]">{report.title}</h1>{report.subtitle && <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600">{report.subtitle}</p>}<div className="mt-7 flex flex-wrap items-center gap-5 border-t pt-5 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><FlaskConical className="h-3.5 w-3.5" />AI Benchmark Studio</span><span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{report.readingTime}</span><span>更新于 {new Date(report.generatedAt).toLocaleDateString("zh-CN")}</span></div></header>
      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[208px_minmax(0,1fr)]">
        <aside className="min-w-0 lg:sticky lg:top-6"><div className="mb-6 hidden lg:block"><div className="eyebrow mb-3">目录</div><nav className="space-y-1">{toc.map((item, index) => <a key={item} href={`#section-${index}`} className="block border-l-2 border-slate-100 py-1.5 pl-3 text-xs text-muted-foreground hover:border-blue-600 hover:text-foreground">{item}</a>)}</nav></div><div className="rounded-lg border bg-slate-50 p-4"><div className="eyebrow">测试快照</div><dl className="mt-4 space-y-3 text-xs">{[["产品", project.products.length], ["Test Cases", protocol.testCases.length], ["独立测试", project.products.length * protocol.testCases.length], ["评分维度", protocol.rubric.length]].map(([term, value]) => <div key={term} className="flex justify-between gap-4"><dt className="text-muted-foreground">{term}</dt><dd className="font-semibold">{value}</dd></div>)}</dl></div></aside>
        <main className="min-w-0 space-y-10">
          <Section id="section-0" number="01" title="TL;DR"><div className="rounded-xl border border-blue-200 bg-blue-50/50 p-6"><div className="flex gap-3"><Quote className="h-5 w-5 shrink-0 text-blue-600" /><div><p className="text-lg font-semibold leading-7">{report.tldr}</p>{report.tldrDetail && <p className="mt-3 text-sm leading-7 text-slate-600">{report.tldrDetail}</p>}</div></div></div></Section>
          <Section id="section-1" number="02" title="最终排名"><div className="space-y-3">{report.ranking.map((item) => { const productInfo = project.products.find((entry) => entry.id === item.productId); return <Card key={item.productId} className="flex items-center gap-4 p-4 shadow-none"><span className={`grid h-8 w-8 place-items-center rounded-full text-xs font-semibold ${item.rank === 1 ? "bg-blue-600 text-white" : "bg-slate-100"}`}>{item.rank}</span><ProductLogo initials={productInfo?.initials ?? item.productName[0]} name={item.productName} className="h-9 w-9" /><div className="flex-1"><div className="text-sm font-semibold">{item.productName}</div><div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100"><div className={`${productInfo?.color ?? "bg-slate-400"} h-full`} style={{ width: `${item.score * 10}%` }} /></div></div><div className="text-2xl font-semibold tabular-nums">{item.score.toFixed(1)}</div></Card>; })}</div></Section>
          <Section id="section-2" number="03" title="为什么测试这些产品"><p>{report.whyTheseProducts}</p></Section>
          <Section id="section-3" number="04" title="我们怎么测试"><div className="grid gap-3 sm:grid-cols-2">{report.methodology.rules.map((item) => <div key={item} className="flex items-center gap-2 rounded-md border p-3 text-sm"><Check className="h-4 w-4 text-emerald-600" />{item}</div>)}</div><p className="mt-4">{report.methodology.summary}</p><div className="mt-4 rounded-md border bg-slate-50 p-3 text-xs">{reviewSummary.adjusted > 0 ? `本次 ${reviewSummary.total} 个评分项中，${reviewSummary.adjusted} 项经过人工调整；报告引用的均为锁定后的 Final Score。` : "本次所有 AI Judge 评分均通过人工复核，没有进行分数调整。"}</div></Section>
          <Section id="section-4" number="05" title="Case 复盘"><div className="space-y-8">{report.caseReviews.map((item, index) => <div key={item.testCaseId} className="border-t pt-5"><div className="eyebrow text-blue-600">CASE {String(index + 1).padStart(2, "0")}</div><h3 className="mt-2 text-lg font-semibold">{item.title}</h3><p className="mt-2">{item.objective}</p><div className="mt-4 rounded-lg border bg-slate-50 p-4"><div className="eyebrow">原始 Prompt</div><p className="mt-2 font-mono text-xs leading-6 text-slate-700">{item.prompt}</p></div><p className="mt-4 text-xs font-medium text-slate-800">{item.findings}</p><div className="mt-4 grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(item.productResults.length, 3)}, minmax(0, 1fr))` }}>{item.productResults.map((product) => <div key={product.productId} className="rounded-md border p-3"><div className="flex justify-between text-xs font-semibold"><span>{product.productName}</span><span>{product.score.toFixed(1)}</span></div><p className="mt-2 text-[11px] leading-5 text-muted-foreground">{product.analysis}</p></div>)}</div></div>)}</div></Section>
          <Section id="section-5" number="06" title="每款产品的优缺点"><div className="space-y-5">{report.productSummaries.map((product) => <div key={product.productId} className="grid gap-2 border-t pt-4 sm:grid-cols-[120px_1fr_1fr]"><strong>{product.productName}</strong><span className="text-sm text-emerald-700">+ {product.strengths.join("、")}</span><span className="text-sm text-red-700">− {product.weaknesses.join("、")}</span></div>)}</div></Section>
          <Section id="section-6" number="07" title="最终推荐"><div className="rounded-xl bg-slate-950 p-6 text-white"><Trophy className="h-6 w-6 text-amber-400" /><h3 className="mt-4 text-xl font-semibold">最终建议</h3><p className="mt-3 text-sm leading-7 text-slate-300">{report.finalRecommendation}</p></div></Section>
          <Section id="section-7" number="08" title="测试限制"><ul className="space-y-2">{report.limitations.map((item) => <li key={item}>{item}</li>)}</ul><div className="mt-5 flex flex-wrap gap-2"><Button variant="outline"><Database className="h-4 w-4" />查看完整测试数据<ArrowUpRight className="h-4 w-4" /></Button><Button asChild><Link href="/projects/demo/publish"><Send className="h-4 w-4" />生成社区内容</Link></Button></div></Section>
        </main>

      </div>
    </article>
  </div>;
}

function Section({ id, number, title, children }: { id: string; number: string; title: string; children: React.ReactNode }) { return <section id={id} className="scroll-mt-8"><div className="eyebrow text-blue-600">{number}</div><h2 className="mt-2 text-xl font-semibold tracking-tight">{title}</h2><div className="mt-5 text-sm leading-7 text-slate-600">{children}</div></section>; }
