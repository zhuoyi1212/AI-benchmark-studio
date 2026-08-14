"use client";

import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUp, Check, Eye, EyeOff, LockKeyhole, Pencil, RotateCcw, Scale, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { WorkflowSteps } from "@/components/workflow-steps";
import { PageHeader } from "@/components/page-header";
import { MockLoader } from "@/components/mock-loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { mockProject } from "@/lib/mock/project.mock";
import { mockProtocol } from "@/lib/mock/protocol.mock";
import { mockBlindSamples, mockStoredReview, REVIEW_STORAGE_KEY } from "@/lib/mock/review.mock";
import { calculateCaseScore, calculateSampleScore, getJudgeScore, getRevealedProduct, getReviewSummary, parseStoredReview } from "@/lib/review-state";
import type { ReviewScore, ReviewStatus, StoredReview } from "@/lib/types/review";
import { cn } from "@/lib/utils";

type Filter = "all" | "adjusted";

export default function ReviewPage() {
  const [review, setReview] = useState<StoredReview>(mockStoredReview);
  const [filter, setFilter] = useState<Filter>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [overrideScore, setOverrideScore] = useState(0);
  const [overrideReason, setOverrideReason] = useState("");
  const [lockDialogOpen, setLockDialogOpen] = useState(false);

  useEffect(() => { const stored = parseStoredReview(window.localStorage.getItem(REVIEW_STORAGE_KEY)); if (stored) setReview(stored); }, []);

  const scores = review.scores;
  const summary = getReviewSummary(scores);
  const editingScore = scores.find((score) => score.judgeScoreId === editingId) ?? null;
  const editingJudgeScore = editingScore ? getJudgeScore(editingScore) : undefined;

  const persist = (next: StoredReview) => { setReview(next); window.localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(next)); };
  const openEditor = (score: ReviewScore) => { setEditingId(score.judgeScoreId); setOverrideScore(score.finalScore); setOverrideReason(score.humanOverride?.reason ?? ""); };
  const saveOverride = () => {
    if (!editingScore) return;
    if (!overrideReason.trim()) { toast.error("请填写修改理由"); return; }
    if (!Number.isFinite(overrideScore) || overrideScore < 0 || overrideScore > 10) { toast.error("评分必须在 0–10 之间"); return; }
    const normalizedScore = Math.round(overrideScore * 10) / 10;
    const nextScores = scores.map((score) => score.judgeScoreId === editingScore.judgeScoreId ? { ...score, finalScore: normalizedScore, humanOverride: { score: normalizedScore, reason: overrideReason.trim(), updatedAt: new Date().toISOString() } } : score);
    persist({ ...review, status: "reviewing", scores: nextScores, updatedAt: new Date().toISOString() });
    setEditingId(null); toast.success("人工修正已保存");
  };
  const restoreAiScore = (id: string) => {
    const nextScores = scores.map((score) => score.judgeScoreId === id ? { ...score, finalScore: score.aiScore, humanOverride: undefined } : score);
    persist({ ...review, status: "reviewing", scores: nextScores, updatedAt: new Date().toISOString() }); toast.success("已恢复 AI 评分");
  };
  const lockScores = () => { persist({ ...review, status: "locked", updatedAt: new Date().toISOString() }); setLockDialogOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); toast.success("最终评分已锁定"); };
  const reveal = () => { persist({ ...review, status: "revealed", updatedAt: new Date().toISOString() }); toast.success("产品身份已揭晓"); };

  if (review.status !== "reviewing") return <LockedReview scores={scores} status={review.status} onReveal={reveal} />;

  return <div className="page-shell">
    <MockLoader label="正在进行 AI Blind Review..." duration={700} />
    <WorkflowSteps current={3} />
    <PageHeader eyebrow={`项目 / ${mockProject.name}`} title="人工复核 AI 评分" description="默认接受 AI Judge 结果；仅在证据与评分明显不一致时修改对应 Rubric 维度。" action={<Badge variant="success"><EyeOff className="h-3 w-3" />产品身份已隐藏</Badge>} />
    <section className="mb-7 grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-[1.3fr_repeat(3,1fr)]"><div className="flex items-center gap-3 bg-white p-5"><span className="grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-blue-600"><Scale className="h-5 w-5" /></span><div><div className="text-sm font-semibold">人工复核</div><div className="mt-0.5 flex items-center gap-1 text-[11px] text-emerald-700"><Check className="h-3 w-3" />复核进度：已完成</div></div></div><SummaryMetric label="评分项" value={summary.total} /><SummaryMetric label="人工调整" value={summary.adjusted} accent /><SummaryMetric label="接受 AI 评分" value={summary.accepted} /></section>
    <div className="mb-6 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 text-blue-600" /><div><p className="text-sm font-semibold text-blue-950">Blind 状态持续生效</p><p className="mt-1 text-xs leading-5 text-blue-800/70">人工复核者只能看到匿名 Sample。最终评分锁定后，才允许揭晓真实产品身份。</p></div></div>
    <Tabs defaultValue={mockProtocol.testCases[0]?.id}><div className="mb-5 flex flex-col justify-between gap-3 lg:flex-row lg:items-center"><div><h2 className="section-title">逐项复核</h2><p className="mt-1 text-xs text-muted-foreground">综合分由 {mockProtocol.rubric.length} 项 Rubric 权重自动计算，不可直接修改。</p></div><div className="flex flex-wrap items-center gap-2"><div className="inline-flex rounded-md border bg-white p-0.5"><button className={cn("rounded px-3 py-1.5 text-xs", filter === "all" ? "bg-slate-100 font-medium text-slate-950" : "text-muted-foreground")} onClick={() => setFilter("all")}>全部评分</button><button className={cn("rounded px-3 py-1.5 text-xs", filter === "adjusted" ? "bg-blue-50 font-medium text-blue-700" : "text-muted-foreground")} onClick={() => setFilter("adjusted")}>仅看人工修改</button></div><TabsList>{mockProtocol.testCases.map((item, index) => <TabsTrigger key={item.id} value={item.id}>Case {index + 1}</TabsTrigger>)}</TabsList></div></div>
      {mockProtocol.testCases.map((testCase, index) => <TabsContent key={testCase.id} value={testCase.id}><div className="mb-3 flex items-center justify-between"><div className="text-xs text-muted-foreground">CASE {String(index + 1).padStart(2, "0")} · {testCase.title}</div><div className="text-[11px] text-muted-foreground">AI Score 始终保留 · Final Score 用于最终结果</div></div><CaseReview scores={scores} testCaseId={testCase.id} filter={filter} onEdit={openEditor} onRestore={restoreAiScore} /></TabsContent>)}
    </Tabs>
    <div className="sticky bottom-5 z-20 mt-8 flex flex-col items-start justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950 p-3 pl-5 text-white shadow-xl sm:flex-row sm:items-center"><div><p className="text-xs font-medium">{summary.adjusted} 项使用人工修正 · {summary.accepted} 项接受 AI 评分</p><p className="mt-0.5 text-[10px] text-slate-400">锁定后将进入产品身份揭晓阶段</p></div><Button className="w-full bg-white text-slate-950 hover:bg-slate-100 sm:w-auto" size="lg" onClick={() => setLockDialogOpen(true)}><LockKeyhole className="h-4 w-4" />确认并锁定最终评分</Button></div>
    <Dialog open={editingScore !== null} onOpenChange={(open) => !open && setEditingId(null)}><DialogContent><DialogTitle>修改评分 · {editingJudgeScore?.rubricDimensionName}</DialogTitle><DialogDescription>AI 原始评分会永久保留，最终结果将使用人工修正后的分数。</DialogDescription>{editingScore && <div className="mt-6 space-y-5"><div className="grid grid-cols-2 gap-3"><div className="rounded-md border bg-slate-50 p-4"><div className="text-[11px] text-muted-foreground">AI 原始评分</div><div className="mt-1 text-2xl font-semibold tabular-nums">{editingScore.aiScore.toFixed(1)}</div><div className="mt-1 text-[10px] text-muted-foreground">只读</div></div><label className="rounded-md border p-4"><span className="text-[11px] text-muted-foreground">人工修正评分</span><Input className="mt-2 text-lg font-semibold" type="number" min={0} max={10} step={0.1} value={overrideScore} onChange={(event) => setOverrideScore(Number(event.target.value))} /></label></div><label className="block"><span className="mb-2 block text-sm font-medium">修改理由 <span className="text-blue-600">*</span></span><Textarea rows={4} value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} placeholder="说明具体证据，以及为什么需要调整 AI 评分…" /></label><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditingId(null)}>取消</Button><Button onClick={saveOverride}>保存修改</Button></div></div>}</DialogContent></Dialog>
    <Dialog open={lockDialogOpen} onOpenChange={setLockDialogOpen}><DialogContent><div className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-blue-600"><LockKeyhole className="h-5 w-5" /></div><DialogTitle>确认最终评分？</DialogTitle><DialogDescription>未进行人工修改的评分将直接使用 AI Judge 结果。人工修改过的 {summary.adjusted} 项评分将使用人工修正后的结果。锁定之后将进入产品身份揭晓阶段。</DialogDescription><div className="mt-6 rounded-md border bg-slate-50 p-3 text-xs leading-6 text-slate-600"><div className="flex justify-between"><span>接受 AI 评分</span><b>{summary.accepted} 项</b></div><div className="flex justify-between"><span>使用人工修正</span><b className="text-blue-700">{summary.adjusted} 项</b></div></div><div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={() => setLockDialogOpen(false)}>继续复核</Button><Button onClick={lockScores}>确认锁定</Button></div></DialogContent></Dialog>
  </div>;
}

function CaseReview({ scores, testCaseId, filter, onEdit, onRestore }: { scores: ReviewScore[]; testCaseId: string; filter: Filter; onEdit: (score: ReviewScore) => void; onRestore: (id: string) => void }) {
  const visibleSamples = mockBlindSamples.map((sample) => ({ ...sample, items: scores.filter((score) => { const judge = getJudgeScore(score); return judge?.testCaseId === testCaseId && judge.sampleId === sample.sampleId && (filter === "all" || score.humanOverride); }) })).filter((sample) => sample.items.length > 0);
  if (visibleSamples.length === 0) return <div className="grid min-h-56 place-items-center rounded-lg border border-dashed bg-white text-center"><div><Check className="mx-auto h-5 w-5 text-emerald-600" /><p className="mt-2 text-sm font-medium">此 Case 没有人工修改</p><p className="mt-1 text-xs text-muted-foreground">全部评分均采用 AI Judge 结果。</p></div></div>;
  return <div className="grid gap-4 xl:grid-cols-3">{visibleSamples.map((sample) => <Card key={sample.sampleId} className="overflow-hidden shadow-none"><div className="flex items-center justify-between border-b bg-slate-50/70 px-4 py-3"><div><div className="text-sm font-semibold">{sample.label}</div><div className="mt-0.5 text-[10px] text-muted-foreground">综合分由维度自动计算</div></div><div className="text-right"><div className="text-xl font-semibold tabular-nums">{calculateCaseScore(scores, sample.sampleId, testCaseId).toFixed(1)}</div><div className="text-[9px] text-muted-foreground">Final Score</div></div></div><div className="divide-y px-4">{sample.items.map((score) => <ScoreItem key={score.judgeScoreId} score={score} onEdit={() => onEdit(score)} onRestore={() => onRestore(score.judgeScoreId)} />)}</div></Card>)}</div>;
}

function ScoreItem({ score, onEdit, onRestore }: { score: ReviewScore; onEdit: () => void; onRestore: () => void }) {
  const judge = getJudgeScore(score); if (!judge) return null;
  const difference = Math.round((score.finalScore - score.aiScore) * 10) / 10;
  const confidence = judge.confidence >= 0.85 ? "高" : judge.confidence >= 0.65 ? "中" : "低";
  return <div className="py-4"><div className="flex items-start justify-between gap-2"><div><div className="text-xs font-semibold">{judge.rubricDimensionName}</div><Badge className="mt-1.5" variant={score.humanOverride ? "default" : "neutral"}>{score.humanOverride ? "人工已修正" : "AI 评分"}</Badge></div><div className="grid grid-cols-2 gap-3 text-right"><div><div className="text-[9px] text-muted-foreground">AI Score</div><div className="mt-0.5 text-sm font-semibold tabular-nums text-slate-500">{score.aiScore.toFixed(1)}</div></div><div><div className="text-[9px] text-muted-foreground">最终评分</div><div className="mt-0.5 text-sm font-semibold tabular-nums text-blue-700">{score.finalScore.toFixed(1)}</div></div></div></div>{score.humanOverride && <div className="mt-3 rounded-md border border-blue-100 bg-blue-50/60 p-3"><div className="flex items-center gap-1 text-[10px] font-semibold text-blue-700">人工已修正 {difference > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}{difference > 0 ? "+" : ""}{difference.toFixed(1)}</div><p className="mt-1.5 text-[10px] leading-5 text-slate-600"><b>修改理由：</b>{score.humanOverride.reason}</p></div>}<div className="mt-3 space-y-2 text-[10px] leading-4 text-slate-600"><p><b className="text-slate-800">AI Reason</b> · {judge.reason}</p><p><b className="text-slate-800">Evidence</b> · {judge.evidence.join(" ")}</p><p><b className="text-slate-800">Confidence</b> · {confidence}（{Math.round(judge.confidence * 100)}%）</p></div><div className="mt-3 flex justify-end gap-1">{score.humanOverride && <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]" onClick={onRestore}><RotateCcw className="h-3 w-3" />恢复 AI 评分</Button>}<Button variant="outline" size="sm" className="h-7 px-2 text-[10px]" onClick={onEdit}><Pencil className="h-3 w-3" />修改评分</Button></div></div>;
}

function LockedReview({ scores, status, onReveal }: { scores: ReviewScore[]; status: Exclude<ReviewStatus, "reviewing">; onReveal: () => void }) {
  const summary = getReviewSummary(scores);
  return <div className="page-shell"><WorkflowSteps current={3} /><PageHeader eyebrow={`项目 / ${mockProject.name}`} title="身份揭晓" description="最终评分已经锁定。产品身份在此之前始终保持隐藏。" action={<Badge variant="success"><LockKeyhole className="h-3 w-3" />最终评分已锁定</Badge>} /><div className="mb-7 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-600" /><div><p className="text-sm font-semibold text-emerald-950">人工复核已完成</p><p className="mt-1 text-xs text-emerald-800/70">{summary.total} 个评分项中，{summary.adjusted} 项经过人工调整；其余 {summary.accepted} 项采用 AI Judge 评分。</p></div></div><div className="mx-auto max-w-3xl"><div className="grid gap-3 sm:grid-cols-3">{mockBlindSamples.map((sample, index) => { const product = getRevealedProduct(sample.sampleId, status); return <Card key={sample.sampleId} className="p-5 text-center shadow-none"><span className="mx-auto grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-xs font-semibold">{index + 1}</span><h2 className="mt-3 text-base font-semibold">{sample.label}</h2><div className="mt-2 text-3xl font-semibold tabular-nums">{calculateSampleScore(scores, sample.sampleId).toFixed(1)}</div><div className="mt-1 text-[10px] text-muted-foreground">最终综合分</div>{product && <div className="mt-4 border-t pt-4 text-sm font-semibold text-blue-700">= {product.name}</div>}</Card>; })}</div><div className="mt-6 flex justify-center">{status === "locked" ? <Button size="lg" onClick={onReveal}><Eye className="h-4 w-4" />揭晓产品身份</Button> : <Button size="lg" asChild><Link href="/projects/demo/results">查看最终结果<ArrowRight className="h-4 w-4" /></Link></Button>}</div>{status === "locked" && <p className="mt-3 text-center text-xs text-muted-foreground">揭晓不会改变已锁定的最终评分。</p>}</div></div>;
}

function SummaryMetric({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) { return <div className="bg-white p-5"><div className="text-[11px] text-muted-foreground">{label}</div><div className={cn("mt-1 text-2xl font-semibold tabular-nums", accent && "text-blue-700")}>{value}</div></div>; }
