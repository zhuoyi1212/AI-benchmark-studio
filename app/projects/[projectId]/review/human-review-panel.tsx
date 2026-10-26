"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowDown, ArrowRight, ArrowUp, Check, Eye, EyeOff, LoaderCircle, LockKeyhole, Pencil, RotateCcw, Scale, ShieldCheck } from "lucide-react";
import {
  lockHumanReviewAction,
  completeQuickReviewAction,
  revealHumanReviewAction,
  revertHumanOverrideAction,
  saveHumanOverrideAction,
  type HumanReviewActionState,
} from "@/app/projects/[projectId]/review/human-review-actions";
import { PageHeader } from "@/components/page-header";
import { WorkflowSteps } from "@/components/workflow-steps";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { HumanReviewScore, HumanReviewWorkspace } from "@/lib/services/human-review.service";
import type { ProjectWorkflowState } from "@/lib/types/workflow-navigation";
import { cn } from "@/lib/utils";

type Filter = "all" | "adjusted" | "anomalies";
const initialState: HumanReviewActionState = { message: null };

export function HumanReviewPanel({ workspace, workflowState }: { workspace: HumanReviewWorkspace; workflowState: ProjectWorkflowState }) {
  const quickMode = workspace.evaluationMode === "quick";
  const [filter, setFilter] = useState<Filter>(quickMode ? "anomalies" : "all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const editingScore = workspace.scores.find((score) => score.judgeScoreId === editingId) ?? null;
  const editingDimension = workspace.rubric.find((dimension) => dimension.id === editingScore?.rubricDimensionId);
  const [overrideState, overrideAction] = useActionState(saveHumanOverrideAction, initialState);
  const [revertState, revertAction] = useActionState(revertHumanOverrideAction, initialState);
  const [lockState, lockAction] = useActionState(lockHumanReviewAction, initialState);
  const [quickState, quickAction] = useActionState(completeQuickReviewAction, initialState);

  if (workspace.status !== "reviewing") return <><div className="mx-auto w-full max-w-[1180px] px-6 pt-8 lg:px-10 lg:pt-10 [&>nav]:mb-0"><WorkflowSteps projectId={workspace.projectId} workflowState={workflowState} /></div><LockedReview workspace={workspace} /></>;
  const visibleScoreCount = filter === "adjusted" ? workspace.summary.adjusted : filter === "anomalies" ? workspace.summary.anomalies : workspace.summary.total;

  return (
    <div className="page-shell">
      <WorkflowSteps projectId={workspace.projectId} workflowState={workflowState} />
      <PageHeader eyebrow={`Human Review / Protocol v${workspace.protocolVersion}`} title={quickMode ? "处理异常评分" : "人工复核 AI 评分"} description={quickMode ? `已自动接受 ${workspace.summary.total - workspace.summary.anomalies} 项高置信度评分，只需检查异常项。` : "默认接受 AI Judge 结果；仅在证据与评分明显不一致时修改具体 Rubric 维度。"} action={<Badge variant="success"><EyeOff className="h-3 w-3" />产品身份已隐藏</Badge>} />
      <section className="mb-7 grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-[1.3fr_repeat(3,1fr)]">
        <div className="flex items-center gap-3 bg-white p-5"><span className="grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-blue-600"><Scale className="h-5 w-5" /></span><div><div className="text-sm font-semibold">人工复核</div><div className="mt-0.5 flex items-center gap-1 text-[11px] text-emerald-700"><Check className="h-3 w-3" />评分矩阵完整</div></div></div>
        <SummaryMetric label="评分项" value={workspace.summary.total} />
        <SummaryMetric label="人工调整" value={workspace.summary.adjusted} accent />
        <SummaryMetric label={quickMode ? "异常评分" : "接受 AI 评分"} value={quickMode ? workspace.summary.anomalies : workspace.summary.accepted} />
      </section>
      <div className="mb-7 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" /><div><p className="text-sm font-semibold text-blue-950">Blind 状态持续生效</p><p className="mt-1 text-xs leading-5 text-blue-800/70">复核期间只显示匿名 Sample。AI 原始评分不可修改；每次人工修正与恢复都会追加审计记录。</p></div></div>

      <Tabs defaultValue={workspace.testCases[0]?.id}>
        <div className="mb-5 flex flex-col justify-between gap-3 lg:flex-row lg:items-center"><div><h2 className="section-title">逐项复核</h2><p className="mt-1 text-xs text-muted-foreground">综合分由 {workspace.rubric.length} 项 Rubric 权重自动计算，不可直接修改。</p></div><div className="flex flex-wrap items-center gap-2"><div className="inline-flex rounded-md border bg-white p-0.5">{quickMode && <button type="button" className={cn("rounded px-3 py-1.5 text-xs", filter === "anomalies" ? "bg-amber-50 font-medium text-amber-800" : "text-muted-foreground")} onClick={() => setFilter("anomalies")}>仅看异常</button>}<button type="button" className={cn("rounded px-3 py-1.5 text-xs", filter === "all" ? "bg-slate-100 font-medium text-slate-950" : "text-muted-foreground")} onClick={() => setFilter("all")}>全部评分</button><button type="button" className={cn("rounded px-3 py-1.5 text-xs", filter === "adjusted" ? "bg-blue-50 font-medium text-blue-700" : "text-muted-foreground")} onClick={() => setFilter("adjusted")}>仅看人工修改</button></div><TabsList>{workspace.testCases.map((item, index) => <TabsTrigger key={item.id} value={item.id}>Case {index + 1}</TabsTrigger>)}</TabsList></div></div>
        {workspace.testCases.map((testCase) => <TabsContent key={testCase.id} value={testCase.id}><div className="mb-3 flex items-center justify-between gap-4"><div className="text-xs text-muted-foreground">CASE {String(testCase.position).padStart(2, "0")} · {testCase.title}</div><div className="text-[11px] text-muted-foreground">当前筛选 {visibleScoreCount} 项</div></div><CaseReview workspace={workspace} testCaseId={testCase.id} filter={filter} onEdit={setEditingId} revertAction={revertAction} /></TabsContent>)}
      </Tabs>
      {revertState.message && <p role="alert" className="mt-3 text-right text-xs text-red-600">{revertState.message}</p>}

      <div className="sticky bottom-5 z-20 mt-8 flex flex-col items-start justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950 p-3 pl-5 text-white shadow-xl sm:flex-row sm:items-center"><div><p className="text-xs font-medium">{workspace.summary.adjusted} 项使用人工修正 · {workspace.summary.accepted} 项接受 AI 评分</p><p className="mt-0.5 text-[10px] text-slate-400">{quickMode ? "确认后锁定评分、揭晓身份，并在后台生成候选 Findings" : "锁定后普通编辑关闭，并进入产品身份揭晓阶段"}</p></div>{quickMode ? <form action={quickAction}><ReviewIds workspace={workspace} /><SubmitButton label="确认异常处理并继续" /></form> : <Button className="w-full bg-white text-slate-950 hover:bg-slate-100 sm:w-auto" size="lg" onClick={() => setLockDialogOpen(true)}><LockKeyhole className="h-4 w-4" />确认并锁定最终评分</Button>}</div>
      {quickState.message && <p role="alert" className="mt-3 text-right text-xs text-red-600">{quickState.message}</p>}

      <Dialog open={editingScore !== null} onOpenChange={(open) => !open && setEditingId(null)}>
        <DialogContent>
          <DialogTitle>修改评分 · {editingDimension?.name}</DialogTitle>
          <DialogDescription>AI 原始评分会永久保留；最终结果使用当前有效的人工修正分数。</DialogDescription>
          {editingScore && <form key={editingScore.judgeScoreId} action={overrideAction} className="mt-6 space-y-5"><ReviewIds workspace={workspace} judgeScoreId={editingScore.judgeScoreId} /><div className="grid grid-cols-2 gap-3"><div className="rounded-md border bg-slate-50 p-4"><div className="text-[11px] text-muted-foreground">AI 原始评分</div><div className="mt-1 text-2xl font-semibold tabular-nums">{editingScore.aiScore.toFixed(1)}</div><div className="mt-1 text-[10px] text-muted-foreground">只读</div></div><label className="rounded-md border p-4"><span className="text-[11px] text-muted-foreground">人工修正评分</span><Input className="mt-2 text-lg font-semibold" name="score" type="number" min={0} max={10} step={0.1} required defaultValue={editingScore.finalScore.toFixed(1)} /></label></div><label className="block"><span className="mb-2 block text-sm font-medium">修改理由 <span className="text-blue-600">*</span></span><Textarea name="reason" rows={4} required maxLength={2000} defaultValue={editingScore.humanOverride?.reason ?? ""} placeholder="说明具体证据，以及为什么需要调整 AI 评分…" /></label>{overrideState.message && <p role="alert" className="text-xs text-red-600">{overrideState.message}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditingId(null)}>取消</Button><SubmitButton label="保存修改" /></div></form>}
        </DialogContent>
      </Dialog>

      <Dialog open={lockDialogOpen} onOpenChange={setLockDialogOpen}>
        <DialogContent><div className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-blue-600"><LockKeyhole className="h-5 w-5" /></div><DialogTitle>确认最终评分？</DialogTitle><DialogDescription>未修改的评分直接使用 AI Judge 结果；{workspace.summary.adjusted} 项人工修正将成为 Final Score。锁定后不可继续编辑。</DialogDescription><form action={lockAction} className="mt-6"><ReviewIds workspace={workspace} /><div className="rounded-md border bg-slate-50 p-3 text-xs leading-6 text-slate-600"><div className="flex justify-between"><span>接受 AI 评分</span><b>{workspace.summary.accepted} 项</b></div><div className="flex justify-between"><span>使用人工修正</span><b className="text-blue-700">{workspace.summary.adjusted} 项</b></div><div className="flex justify-between"><span>累计审计事件</span><b>{workspace.summary.auditEvents} 条</b></div></div>{lockState.message && <p role="alert" className="mt-3 text-xs text-red-600">{lockState.message}</p>}<div className="mt-6 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setLockDialogOpen(false)}>继续复核</Button><SubmitButton label="确认锁定" /></div></form></DialogContent>
      </Dialog>
    </div>
  );
}

function CaseReview({ workspace, testCaseId, filter, onEdit, revertAction, readOnly = false }: { workspace: HumanReviewWorkspace; testCaseId: string; filter: Filter; onEdit?: (id: string) => void; revertAction?: (payload: FormData) => void; readOnly?: boolean }) {
  const visibleSamples = workspace.samples.map((sample) => ({
    ...sample,
    scores: workspace.scores.filter((score) => score.testCaseId === testCaseId && score.blindSampleId === sample.sampleId && (filter === "all" || (filter === "adjusted" && score.humanOverride) || (filter === "anomalies" && score.reviewFlags.length > 0))),
  })).filter((sample) => sample.scores.length > 0);
  if (visibleSamples.length === 0) return <div className="grid min-h-56 place-items-center rounded-lg border border-dashed bg-white text-center"><div><Check className="mx-auto h-5 w-5 text-emerald-600" /><p className="mt-2 text-sm font-medium">此 Case 没有人工修改</p><p className="mt-1 text-xs text-muted-foreground">全部评分均采用 AI Judge 结果。</p></div></div>;
  return <div className={cn("grid gap-4", visibleSamples.length === 2 ? "xl:grid-cols-2" : visibleSamples.length > 2 ? "xl:grid-cols-3" : "grid-cols-1")}>{visibleSamples.map((sample) => <Card key={sample.sampleId} className="overflow-hidden shadow-none"><div className="flex items-center justify-between border-b bg-slate-50/70 px-4 py-3"><div><div className="text-sm font-semibold">{sample.label}</div><div className="mt-0.5 text-[10px] text-muted-foreground">综合分自动计算</div></div><div className="text-right"><div className="text-xl font-semibold tabular-nums">{calculateCaseScore(workspace, sample.sampleId, testCaseId).toFixed(1)}</div><div className="text-[9px] text-muted-foreground">Final Score</div></div></div><div className="divide-y px-4">{sample.scores.map((score) => <ScoreItem key={score.judgeScoreId} workspace={workspace} score={score} onEdit={onEdit ? () => onEdit(score.judgeScoreId) : undefined} revertAction={revertAction} readOnly={readOnly} />)}</div></Card>)}</div>;
}

function ScoreItem({ workspace, score, onEdit, revertAction, readOnly = false }: { workspace: HumanReviewWorkspace; score: HumanReviewScore; onEdit?: () => void; revertAction?: (payload: FormData) => void; readOnly?: boolean }) {
  const audit = workspace.auditHistory?.filter(event => event.judgeScoreId === score.judgeScoreId) ?? [];
  const dimension = workspace.rubric.find((item) => item.id === score.rubricDimensionId);
  const difference = Math.round((score.finalScore - score.aiScore) * 10) / 10;
  const confidence = score.confidence >= 0.85 ? "高" : score.confidence >= 0.65 ? "中" : "低";
  return <div className="min-w-0 break-words py-4"><div className="flex items-start justify-between gap-2"><div><div className="text-xs font-semibold">{dimension?.name}</div><Badge className="mt-1.5" variant={score.humanOverride ? "default" : "neutral"}>{score.humanOverride ? "人工已修正" : "AI 评分"}</Badge></div><div className="grid grid-cols-2 gap-3 text-right"><div><div className="text-[9px] text-muted-foreground">AI Score</div><div className="mt-0.5 text-sm font-semibold tabular-nums text-slate-500">{score.aiScore.toFixed(1)}</div></div><div><div className="text-[9px] text-muted-foreground">最终评分</div><div className="mt-0.5 text-sm font-semibold tabular-nums text-blue-700">{score.finalScore.toFixed(1)}</div></div></div></div>{score.humanOverride && <div className="mt-3 rounded-md border border-blue-100 bg-blue-50/60 p-3"><div className="flex items-center gap-1 text-[10px] font-semibold text-blue-700">人工已修正 {difference >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}{difference > 0 ? "+" : ""}{difference.toFixed(1)}</div><p className="mt-1.5 text-[10px] leading-5 text-slate-600"><b>修改理由：</b>{score.humanOverride.reason}</p>{score.revisionCount > 1 && <p className="mt-1 text-[9px] text-blue-700/70">累计 {score.revisionCount} 条审计记录</p>}</div>}<div className="mt-3 space-y-2 text-[10px] leading-4 text-slate-600"><p><b className="text-slate-800">AI Reason</b> · {score.reason}</p><p><b className="text-slate-800">Evidence</b> · {score.evidence.join(" ")}</p><p><b className="text-slate-800">Confidence</b> · {confidence}（{Math.round(score.confidence * 100)}%）</p></div><div className="mt-3 flex justify-end gap-1">{!readOnly && score.humanOverride && revertAction && <form action={revertAction}><ReviewIds workspace={workspace} judgeScoreId={score.judgeScoreId} /><SubmitButton label="恢复 AI 评分" icon="revert" compact /></form>}{!readOnly && onEdit && <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[10px]" onClick={onEdit}><Pencil className="h-3 w-3" />修改评分</Button>}</div>{audit.length > 0 && <details className="mt-3 rounded-md border p-3"><summary className="cursor-pointer text-[11px] font-medium">修改记录 · {audit.length} 条</summary><ol className="mt-3 space-y-3 text-[11px] leading-5">{audit.map(event => <li key={event.id}><p className="font-medium">{event.action === 'override' ? `人工修正为 ${event.score?.toFixed(1)}` : '恢复 AI 评分'}</p>{event.reason && <p className="whitespace-pre-wrap break-words text-slate-600">{event.reason}</p>}<time className="text-muted-foreground" dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}</time></li>)}</ol></details>}</div>;
}

function LockedReview({ workspace }: { workspace: HumanReviewWorkspace }) {
  const [revealState, revealAction] = useActionState(revealHumanReviewAction, initialState);
  const revealed = workspace.status === "revealed";
  return <div className="page-shell"><PageHeader eyebrow={`Human Review / Protocol v${workspace.protocolVersion}`} title={revealed ? "产品身份已揭晓" : "最终评分已锁定"} description={revealed ? "身份揭晓没有改变任何已锁定 Final Score。" : "产品身份仍保持隐藏；下一步确认揭晓真实产品。"} action={<Badge variant="success">{revealed ? <Eye className="h-3 w-3" /> : <LockKeyhole className="h-3 w-3" />}{revealed ? "已揭晓" : "Final Score 已锁定"}</Badge>} /><div className="mb-7 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /><div><p className="text-sm font-semibold text-emerald-950">人工复核已完成</p><p className="mt-1 text-xs text-emerald-800/70">{workspace.summary.total} 个评分项中，{workspace.summary.adjusted} 项经过人工调整；其余 {workspace.summary.accepted} 项采用 AI Judge 评分。</p></div></div><div className="mx-auto max-w-3xl"><div className="grid gap-3 sm:grid-cols-3">{workspace.samples.map((sample, index) => { const mapping = workspace.revealedMappings?.find((item) => item.sampleId === sample.sampleId); return <Card key={sample.sampleId} className="p-5 text-center shadow-none"><span className="mx-auto grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-xs font-semibold">{index + 1}</span><h2 className="mt-3 text-base font-semibold">{sample.label}</h2><div className="mt-2 text-3xl font-semibold tabular-nums">{calculateSampleScore(workspace, sample.sampleId).toFixed(1)}</div><div className="mt-1 text-[10px] text-muted-foreground">最终综合分</div>{mapping && <div className="mt-4 border-t pt-4 text-sm font-semibold text-blue-700">= {mapping.productName}</div>}</Card>; })}</div><div className="mt-6 flex justify-center">{revealed ? <Button size="lg" asChild><Link href={`/projects/${workspace.projectId}/results`}>查看最终结果<ArrowRight className="h-4 w-4" /></Link></Button> : <form action={revealAction}><ReviewIds workspace={workspace} /><SubmitButton label="揭晓产品身份" icon="reveal" large /></form>}</div>{revealState.message && <p role="alert" className="mt-3 text-center text-xs text-red-600">{revealState.message}</p>}{!revealed && <p className="mt-3 text-center text-xs text-muted-foreground">揭晓不会改变已锁定的最终评分。</p>}</div><section className="mt-8"><h2 className="section-title">评分与复核明细</h2><p className="mt-2 text-xs text-muted-foreground">评分已锁定，以下内容仅供查看。</p><div className="mt-4 space-y-6">{workspace.testCases.map(testCase => <section key={testCase.id}><h3 className="mb-3 text-sm font-semibold">{testCase.title}</h3><CaseReview workspace={workspace} testCaseId={testCase.id} filter="all" readOnly /></section>)}</div></section></div>;
}

function ReviewIds({ workspace, judgeScoreId }: { workspace: HumanReviewWorkspace; judgeScoreId?: string }) {
  return <><input type="hidden" name="projectId" value={workspace.projectId} /><input type="hidden" name="reviewSessionId" value={workspace.reviewSessionId} />{judgeScoreId && <input type="hidden" name="judgeScoreId" value={judgeScoreId} />}</>;
}

function SubmitButton({ label, icon, compact = false, large = false }: { label: string; icon?: "revert" | "reveal"; compact?: boolean; large?: boolean }) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant={compact ? "ghost" : "default"} size={compact ? "sm" : large ? "lg" : "default"} className={compact ? "h-7 px-2 text-[10px]" : undefined} disabled={pending}>{pending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : icon === "revert" ? <RotateCcw className="h-3 w-3" /> : icon === "reveal" ? <Eye className="h-4 w-4" /> : null}{pending ? "处理中..." : label}</Button>;
}

function SummaryMetric({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return <div className="bg-white p-5"><div className="text-[11px] text-muted-foreground">{label}</div><div className={cn("mt-1 text-2xl font-semibold tabular-nums", accent && "text-blue-700")}>{value}</div></div>;
}

function calculateCaseScore(workspace: HumanReviewWorkspace, sampleId: string, testCaseId: string) {
  return roundOne(workspace.rubric.reduce((total, dimension) => {
    const score = workspace.scores.find((item) => item.blindSampleId === sampleId && item.testCaseId === testCaseId && item.rubricDimensionId === dimension.id)?.finalScore ?? 0;
    return total + score * dimension.weight / 100;
  }, 0));
}

function calculateSampleScore(workspace: HumanReviewWorkspace, sampleId: string) {
  const caseScores = workspace.testCases.map((testCase) => calculateCaseScore(workspace, sampleId, testCase.id));
  return roundOne(caseScores.reduce((total, score) => total + score, 0) / Math.max(caseScores.length, 1));
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}
