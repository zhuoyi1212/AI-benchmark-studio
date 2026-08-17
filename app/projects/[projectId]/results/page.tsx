import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, ArrowRight, Award, Bot, Check, Crown, FileText, Scale, Sparkles, UserCheck, Users2, X } from "lucide-react";
import { ResultAnalysisAction } from "@/app/projects/[projectId]/results/result-analysis-action";
import { PageHeader } from "@/components/page-header";
import { ProductLogo } from "@/components/product-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getResultsWorkspace, type FinalProductScore, type ResultsWorkspace } from "@/lib/services/result-analysis.service";

export const maxDuration = 300;
type ResultsPageProps = { params: Promise<{ projectId: string }> };

export default async function ResultsPage({ params }: ResultsPageProps) {
  await connection();
  const { projectId } = await params;
  const workspace = await getResultsWorkspace(projectId);
  if (!workspace) redirect(`/projects/${projectId}/review`);
  const analysis = workspace.latestAnalysis;
  if (!analysis || analysis.stale || analysis.status !== "completed" || !analysis.output) {
    return <AnalysisState workspace={workspace} />;
  }

  const champion = workspace.productScores[0];
  const gridTemplate = `160px repeat(${workspace.rubric.length}, minmax(82px, 1fr))`;
  return <div className="page-shell"><Link href={`/projects/${projectId}/review`} className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />返回评分复核</Link><PageHeader eyebrow={`Final Results / Protocol v${workspace.protocolVersion}`} title="最终结果" description="排名来自锁定 Final Score；分析基于 Judge Evidence、人工复核与真实 Artifact metadata。" action={<Badge variant="success"><Check className="h-3 w-3" />分析已绑定当前评分</Badge>} />
    {champion && <section className="rounded-xl border border-blue-200 bg-white p-7 shadow-soft"><div className="flex flex-col justify-between gap-7 sm:flex-row sm:items-end"><div><div className="eyebrow text-blue-600">综合冠军</div><div className="mt-4 flex items-center gap-4"><ProductLogo initials={initials(champion.productName)} name={champion.productName} className="h-14 w-14 rounded-xl text-xl" /><div><h2 className="text-3xl font-semibold tracking-[-.04em]">{champion.productName}</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{analysis.output.winnerReason}</p></div></div></div><div className="flex items-end gap-3"><Crown className="mb-2 h-6 w-6 text-amber-500" /><div className="text-6xl font-semibold tracking-[-.06em] text-blue-700">{champion.finalScore.toFixed(1)}</div><div className="mb-2 text-xs text-muted-foreground">/ 10</div></div></div></section>}
    <section className="mt-4 flex flex-col justify-between gap-4 rounded-lg border bg-white p-4 sm:flex-row sm:items-center"><div className="flex items-center gap-4"><div className="flex -space-x-1"><span className="grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-slate-100 text-slate-600"><Bot className="h-4 w-4" /></span><span className="grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-blue-100 text-blue-700"><UserCheck className="h-4 w-4" /></span></div><div><div className="text-xs font-semibold">评分来源 · AI Judge + 人工复核</div><p className="mt-1 text-[11px] text-muted-foreground">{workspace.reviewSummary.total} 个评分项中，{workspace.reviewSummary.adjusted} 项经过人工调整，{workspace.reviewSummary.accepted} 项接受 AI 评分；分析签名 {workspace.finalScoreSignature.slice(0, 10)}…</p></div></div></section>
    <section className="mt-8"><div className="mb-4 flex items-center justify-between"><h2 className="section-title">维度表现</h2><span className="text-xs text-muted-foreground">Final Score · 满分 10</span></div><Card className="overflow-x-auto p-5 shadow-none"><div style={{ minWidth: `${160 + workspace.rubric.length * 98}px` }}><div className="grid gap-4 border-b pb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" style={{ gridTemplateColumns: gridTemplate }}><span>产品 / 综合分</span>{workspace.rubric.map((item) => <span key={item.id} className="text-center">{item.name}</span>)}</div>{workspace.productScores.map((product, index) => <ScoreRow key={product.productId} product={product} index={index} gridTemplate={gridTemplate} />)}</div></Card></section>
    <section className="mt-8 rounded-lg border bg-white p-5"><div className="eyebrow">跨产品发现</div><div className="mt-3 grid gap-2 md:grid-cols-2">{analysis.output.crossProductInsights.map((insight) => <div key={insight} className="rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-700">{insight}</div>)}</div>{analysis.output.counterintuitiveFindings.length > 0 && <><div className="mt-5 eyebrow">反直觉发现</div><div className="mt-3 space-y-2">{analysis.output.counterintuitiveFindings.map((item) => <p key={item} className="text-xs leading-5 text-slate-700">{item}</p>)}</div></>}</section>
    <section className="mt-8 grid gap-4 xl:grid-cols-3">{workspace.productScores.map((score, index) => { const item = analysis.output!.products.find((entry) => entry.productId === score.productId)!; return <Card key={item.productId} className="p-5 shadow-none"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><ProductLogo initials={initials(score.productName)} name={score.productName} className="h-9 w-9" /><div><h3 className="text-sm font-semibold">{score.productName}</h3><span className="text-xs text-muted-foreground">#{index + 1} · {score.finalScore.toFixed(1)}{score.adjustedCount > 0 && ` · ${score.adjustedCount} 项调整`}</span></div></div>{index === 0 && <Award className="h-5 w-5 text-amber-500" />}</div><p className="mt-4 border-y py-3 text-xs font-medium leading-5">{item.headline}</p><InfoList label="优势" items={item.strengths} positive /><InfoList label="劣势" items={item.weaknesses} /><div className="mt-4 space-y-3 rounded-md bg-slate-50 p-3"><Audience label="最适合" items={item.bestFor} /><Audience label="不适合" items={item.notIdealFor} /></div></Card>; })}</section>
    <section className="mt-8 rounded-lg border bg-white p-5"><div className="eyebrow">最终建议</div><p className="mt-3 text-sm leading-7 text-slate-700">{analysis.output.recommendationSummary}</p><div className="mt-5 border-t pt-4"><div className="eyebrow">测试限制</div><ul className="mt-2 space-y-1.5">{analysis.output.limitations.map((item) => <li key={item} className="text-xs leading-5 text-muted-foreground">· {item}</li>)}</ul></div></section>
    <section className="mt-8 flex flex-col items-center rounded-xl border bg-slate-950 px-6 py-8 text-center text-white"><Sparkles className="h-5 w-5 text-blue-400" /><h2 className="mt-3 text-xl font-semibold">把已锁定结果组织成深度报告</h2><p className="mt-2 max-w-lg text-xs leading-6 text-slate-400">报告将绑定本次 Final Result Analysis，并保留方法与真实证据追溯。</p><Button className="mt-5 bg-white text-slate-950 hover:bg-slate-100" asChild><Link href={`/projects/${projectId}/report`}><FileText className="h-4 w-4" />生成深度报告<ArrowRight className="h-4 w-4" /></Link></Button></section>
  </div>;
}

function AnalysisState({ workspace }: { workspace: ResultsWorkspace }) {
  const analysis = workspace.latestAnalysis;
  const failed = analysis?.status === "failed";
  const running = analysis?.status === "pending" || analysis?.status === "running";
  return <div className="page-shell"><PageHeader eyebrow={`Final Results / Protocol v${workspace.protocolVersion}`} title="生成最终结果分析" description="产品身份已经揭晓。系统将使用锁定 Final Score、Judge Evidence、人工复核与 Artifact metadata 重新分析结论。" action={<Badge variant="success"><Scale className="h-3 w-3" />Final Score 已锁定</Badge>} /><Card className="mx-auto max-w-2xl p-8 text-center shadow-none"><Sparkles className="mx-auto h-6 w-6 text-blue-600" /><h2 className="mt-4 text-lg font-semibold">{failed ? "上次分析未完成" : running ? "最终分析进行中" : analysis?.stale ? "评分签名已变化，需要重新分析" : "准备生成真实分析"}</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">排名由当前 Final Score 确定；AI 只负责解释优势、弱点、用户适配、跨产品洞察与限制，不会重新判分。</p><div className="mt-6">{running ? <div className="text-sm text-blue-700">正在分析，请稍后刷新页面…</div> : <ResultAnalysisAction projectId={workspace.projectId} retry={failed || analysis?.stale} />}</div>{failed && analysis?.errorMessage && <p className="mt-3 text-xs text-amber-700">{analysis.errorMessage}</p>}</Card></div>;
}

function ScoreRow({ product, index, gridTemplate }: { product: FinalProductScore; index: number; gridTemplate: string }) {
  return <div className="grid items-center gap-4 border-b py-4 last:border-0" style={{ gridTemplateColumns: gridTemplate }}><div className="flex items-center gap-3"><span className={cnRank(index)}>{index + 1}</span><div><div className="text-sm font-semibold">{product.productName}</div><div className="text-xs font-semibold text-blue-700">{product.finalScore.toFixed(1)}</div></div></div>{product.dimensionScores.map((dimension) => <div key={dimension.dimensionId} className="text-center"><div className="text-sm font-semibold tabular-nums">{dimension.score.toFixed(1)}</div><div className="mx-auto mt-1.5 h-1 w-12 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${dimension.score * 10}%` }} /></div></div>)}</div>;
}

function InfoList({ label, items, positive = false }: { label: string; items: string[]; positive?: boolean }) { const Icon = positive ? Check : X; return <div className="mt-4"><div className="eyebrow">{label}</div><ul className="mt-2 space-y-1.5">{items.map((item) => <li key={item} className="flex gap-2 text-xs text-slate-600"><Icon className={`mt-0.5 h-3 w-3 ${positive ? "text-emerald-600" : "text-red-500"}`} />{item}</li>)}</ul></div>; }
function Audience({ label, items }: { label: string; items: string[] }) { return <div><div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground"><Users2 className="h-3 w-3" />{label}</div><p className="mt-1 text-[11px] leading-5">{items.join("；")}</p></div>; }
function initials(name: string) { return name.split(/[\s.-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function cnRank(index: number) { return `grid h-6 w-6 place-items-center rounded-full text-[10px] font-semibold ${index === 0 ? "bg-blue-600 text-white" : "bg-slate-100"}`; }
