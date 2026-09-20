import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, ArrowUpRight, Check, Clock3, Database, FileText, FlaskConical, Quote, Send, Sparkles, Trophy } from "lucide-react";
import { ReportGenerationAction } from "@/app/projects/[projectId]/report/report-generation-action";
import { ProductLogo } from "@/components/product-logo";
import { WorkflowSteps } from "@/components/workflow-steps";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getReportWorkspace, type ReportEvidence, type ReportWorkspace } from "@/lib/services/report.service";
import { getProjectWorkflowState } from "@/lib/services/workflow-navigation.service";
import type { ProjectWorkflowState } from "@/lib/types/workflow-navigation";

export const maxDuration = 300;
const comparisonToc = ["TL;DR", "最终排名", "为什么测试", "我们怎么测试", "Case 复盘", "产品优缺点", "最终推荐", "测试限制"];
const singleToc = ["TL;DR", "体验得分", "为什么体验", "我们怎么体验", "场景复盘", "优点与问题", "体验结论", "测试限制"];

export default async function ReportPage({ params }: { params: Promise<{ projectId: string }> }) {
  await connection();
  const { projectId } = await params;
  const [workspace, workflowState] = await Promise.all([
    getReportWorkspace(projectId),
    getProjectWorkflowState(projectId),
  ]);
  if (!workspace) redirect(`/projects/${projectId}/results`);
  if (!workflowState) redirect("/projects");
  if (!workspace.report || workspace.report.status !== "completed" || !workspace.report.content) {
    return <ReportState workspace={workspace} workflowState={workflowState} />;
  }
  const report = workspace.report.content;
  const singleProduct = workspace.projectMode === "single";
  const toc = singleProduct ? singleToc : comparisonToc;
  const analysisByProduct = new Map(workspace.analysis.products.map((product) => [product.productId, product]));
  const caseScoreById = new Map(workspace.caseScores.map((item) => [item.testCaseId, item.products]));
  const evidenceByCase = Map.groupBy(workspace.evidence, (item) => item.testCaseId);
  return <div className="min-h-screen bg-white">
    <div className="border-b bg-[#fafafa]"><div className="mx-auto flex max-w-[1180px] items-center justify-between px-6 py-3 lg:px-10"><Link href={`/projects/${projectId}/results`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />返回结果</Link><div className="flex items-center gap-2"><Badge variant="success"><Check className="h-3 w-3" />{singleProduct ? "体验报告已生成" : "报告已生成"}</Badge><Button size="sm" asChild><Link href={`/projects/${projectId}/publish`}><Send className="h-3.5 w-3.5" />生成社区内容</Link></Button></div></div></div>
    <div className="mx-auto max-w-[1180px] px-6 pt-8 lg:px-10"><WorkflowSteps projectId={projectId} workflowState={workflowState} /></div>
    <article className="mx-auto max-w-[1180px] px-6 pb-24 pt-12 lg:px-10">
      <header className="max-w-4xl"><div className="eyebrow text-blue-600">{report.eyebrow}</div><h1 className="mt-4 text-4xl font-semibold leading-[1.15] tracking-[-.045em] text-slate-950 sm:text-5xl">{report.title}</h1><p className="mt-5 max-w-3xl text-base leading-7 text-slate-600">{report.subtitle}</p><div className="mt-7 flex flex-wrap items-center gap-5 border-t pt-5 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><FlaskConical className="h-3.5 w-3.5" />AI Benchmark Studio</span><span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{report.readingTimeMinutes} 分钟阅读</span><span>Report v{workspace.report.version}</span><span>更新于 {formatDate(workspace.report.completedAt)}</span></div></header>
      <div className="mt-12 grid gap-12 lg:grid-cols-[180px_minmax(0,760px)] xl:grid-cols-[180px_minmax(0,760px)_1fr]">
        <aside className="hidden lg:block"><div className="sticky top-6"><div className="eyebrow mb-3">目录</div><nav className="space-y-1">{toc.map((item, index) => <a key={item} href={`#section-${index}`} className="block border-l-2 border-slate-100 py-1.5 pl-3 text-xs text-muted-foreground hover:border-blue-600 hover:text-foreground">{item}</a>)}</nav></div></aside>
        <main className="min-w-0 space-y-14">
          <Section id="section-0" number="01" title="TL;DR"><div className="rounded-xl border border-blue-200 bg-blue-50/50 p-6"><div className="flex gap-3"><Quote className="h-5 w-5 shrink-0 text-blue-600" /><div><p className="text-lg font-semibold leading-7 text-slate-900">{report.tldr}</p><p className="mt-3 text-sm leading-7 text-slate-600">{report.tldrDetail}</p></div></div></div></Section>
          <Section id="section-1" number="02" title={singleProduct ? "综合体验得分" : "最终排名"}><div className="space-y-3">{workspace.ranking.map((item, index) => <Card key={item.productId} className="flex items-center gap-4 p-4 shadow-none">{!singleProduct && <span className={`grid h-8 w-8 place-items-center rounded-full text-xs font-semibold ${index === 0 ? "bg-blue-600 text-white" : "bg-slate-100"}`}>{index + 1}</span>}<ProductLogo initials={initials(item.productName)} name={item.productName} className="h-9 w-9" /><div className="flex-1"><div className="text-sm font-semibold text-slate-900">{item.productName}</div><div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-blue-600" style={{ width: `${item.finalScore * 10}%` }} /></div></div><div className="text-2xl font-semibold tabular-nums text-slate-950">{item.finalScore.toFixed(1)}</div></Card>)}</div></Section>
          <Section id="section-2" number="03" title={singleProduct ? "为什么体验这款产品" : "为什么测试这些产品"}><p>{report.whyTheseProducts}</p></Section>
          <Section id="section-3" number="04" title={singleProduct ? "我们怎么体验" : "我们怎么测试"}><div className="grid gap-3 sm:grid-cols-2">{workspace.protocol.rules.map((item, index) => <div key={index} className="flex items-center gap-2 rounded-md border p-3 text-sm"><Check className="h-4 w-4 shrink-0 text-emerald-600" />{ruleText(item)}</div>)}</div><p className="mt-4">{report.methodologySummary}</p><div className="mt-4 rounded-md border bg-slate-50 p-3 text-xs">{workspace.review.adjustmentCount > 0 ? `本次有 ${workspace.review.adjustmentCount} 个评分项经过人工调整；报告引用的均为锁定后的 Final Score。` : "本次所有 AI Judge 评分均通过人工复核，没有进行分数调整。"}</div></Section>
          <Section id="section-4" number="05" title="Case 复盘"><div className="space-y-9">{workspace.protocol.testCases.map((testCase, index) => { const generated = report.caseReviews.find((item) => item.testCaseId === testCase.id)!; const scores = caseScoreById.get(testCase.id) ?? []; const evidence = evidenceByCase.get(testCase.id) ?? []; return <div key={testCase.id} className="border-t pt-5"><div className="eyebrow text-blue-600">CASE {String(index + 1).padStart(2, "0")}</div><h3 className="mt-2 text-lg font-semibold text-slate-900">{testCase.title}</h3><p className="mt-2">{testCase.objective}</p><div className="mt-4 rounded-lg border bg-slate-50 p-4"><div className="eyebrow">原始 Prompt</div><p className="mt-2 whitespace-pre-wrap font-mono text-xs leading-6 text-slate-700">{testCase.prompt}</p></div><p className="mt-4 font-medium text-slate-800">{generated.findings}</p><div className="mt-4 grid gap-3 md:grid-cols-3">{workspace.ranking.map((product) => { const score = scores.find((item) => item.productId === product.productId); const narrative = generated.productAnalyses.find((item) => item.productId === product.productId); const productEvidence = evidence.filter((item) => item.productId === product.productId); return <div key={product.productId} className="rounded-md border p-3"><div className="flex justify-between text-xs font-semibold text-slate-900"><span>{product.productName}</span><span>{score?.score.toFixed(1)}</span></div><p className="mt-2 text-[11px] leading-5 text-muted-foreground">{narrative?.analysis}</p><EvidenceLinks items={productEvidence} /></div>})}</div></div>})}</div></Section>
          <Section id="section-5" number="06" title={singleProduct ? "产品优点与暴露的问题" : "每款产品的优缺点"}><div className="space-y-5">{workspace.ranking.map((product) => { const item = analysisByProduct.get(product.productId)!; return <div key={product.productId} className="grid gap-2 border-t pt-4 sm:grid-cols-[120px_1fr_1fr]"><strong className="text-slate-900">{product.productName}</strong><span className="text-sm text-emerald-700">+ {item.strengths.join("、")}</span><span className="text-sm text-red-700">− {item.weaknesses.join("、")}</span></div>})}</div></Section>
          <Section id="section-6" number="07" title={singleProduct ? "最终体验结论" : "最终推荐"}><div className="rounded-xl bg-slate-950 p-6 text-white">{singleProduct ? <Sparkles className="h-6 w-6 text-blue-300" /> : <Trophy className="h-6 w-6 text-amber-400" />}<h3 className="mt-4 text-xl font-semibold">最终建议</h3><p className="mt-3 text-sm leading-7 text-slate-300">{report.finalRecommendation}</p></div></Section>
          <Section id="section-7" number="08" title="测试限制"><ul className="space-y-2">{workspace.analysis.limitations.map((item) => <li key={item}>· {item}</li>)}</ul><div className="mt-5 flex flex-wrap gap-2"><Button variant="outline" asChild><Link href={`/projects/${projectId}/test`}><Database className="h-4 w-4" />查看完整测试数据<ArrowUpRight className="h-4 w-4" /></Link></Button><Button asChild><Link href={`/projects/${projectId}/publish`}><Send className="h-4 w-4" />生成社区内容</Link></Button></div></Section>
        </main>
        <aside className="hidden xl:block"><div className="sticky top-6 rounded-lg border bg-slate-50 p-4"><div className="eyebrow">测试快照</div><dl className="mt-4 space-y-3 text-xs">{[["产品", workspace.ranking.length], ["Test Cases", workspace.protocol.testCases.length], ["原始证据", workspace.evidence.length], ["评分维度", workspace.protocol.rubric.length]].map(([term, value]) => <div key={term} className="flex justify-between"><dt className="text-muted-foreground">{term}</dt><dd className="font-semibold text-slate-900">{value}</dd></div>)}</dl><div className="mt-4 border-t pt-3 text-[10px] leading-5 text-muted-foreground">绑定当前 Final Result Analysis；{singleProduct ? "报告正文不改变评分或证据。" : "报告正文不改变评分、排名或证据。"}</div></div></aside>
      </div>
    </article>
  </div>;
}

function ReportState({ workspace, workflowState }: { workspace: ReportWorkspace; workflowState: ProjectWorkflowState }) {
  const failed = workspace.report?.status === "failed";
  const running = workspace.report?.status === "pending" || workspace.report?.status === "running";
  const singleMode = workspace.projectMode === "single";
  return <div className="page-shell"><WorkflowSteps projectId={workspace.projectId} workflowState={workflowState} /><Link href={`/projects/${workspace.projectId}/results`} className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />返回最终结果</Link><div className="mx-auto max-w-2xl pt-12 text-center"><Badge variant="neutral"><FileText className="h-3 w-3" />{singleMode ? "Experience Report" : "Deep Report"}</Badge><h1 className="mt-5 text-3xl font-semibold tracking-[-.04em]">{failed ? "上次报告未完成" : running ? "深度报告生成中" : singleMode ? "生成可追溯的深度体验报告" : "生成可追溯的深度报告"}</h1><p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-muted-foreground">{singleMode ? `报告将把 Research、体验方案、Final Score、Judge Evidence、人工复核和 ${workspace.protocol.testCases.length} 个真实体验场景组织成完整心得。` : `报告将绑定当前 Final Result Analysis，并组织 Protocol、Research、Final Score、Judge Evidence、人工复核和 ${workspace.protocol.testCases.length} 个 Case 的真实 Artifact。`}</p><Card className="mt-8 p-8 shadow-none">{running ? <div className="text-sm text-blue-700">正在组织报告，请稍后刷新页面…</div> : <ReportGenerationAction projectId={workspace.projectId} retry={failed} />}{failed && workspace.report?.errorMessage && <p className="mt-3 text-xs text-amber-700">{workspace.report.errorMessage}</p>}</Card></div></div>;
}

function EvidenceLinks({ items }: { items: ReportEvidence[] }) {
  if (items.length === 0) return null;
  return <div className="mt-3 border-t pt-2"><div className="eyebrow">Raw Artifact</div><div className="mt-1.5 space-y-1">{items.map((item) => <a key={item.artifactId} href={item.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[10px] text-blue-700 hover:underline"><FileText className="h-3 w-3" /><span className="truncate">{item.fileName}</span></a>)}</div></div>;
}

function Section({ id, number, title, children }: { id: string; number: string; title: string; children: React.ReactNode }) { return <section id={id} className="scroll-mt-8"><div className="eyebrow text-blue-600">{number}</div><h2 className="mt-2 text-2xl font-semibold tracking-[-.03em] text-slate-950">{title}</h2><div className="mt-5 text-sm leading-7 text-slate-600">{children}</div></section>; }
function initials(name: string) { return name.split(/[\s.-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function formatDate(value: string | null) { return value ? new Date(value).toLocaleDateString("zh-CN") : "—"; }
function ruleText(value: unknown) { if (typeof value === "string") return value; if (value && typeof value === "object" && "text" in value && typeof value.text === "string") return value.text; return "已锁定测试规则"; }
