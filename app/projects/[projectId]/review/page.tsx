import { AlertTriangle, ArrowLeft, CheckCircle2, EyeOff, FileCheck2, LockKeyhole, Scale, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { WorkflowSteps } from "@/components/workflow-steps";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RunBlindJudgeAction } from "@/app/projects/[projectId]/review/judge-action";
import { HumanReviewPanel } from "@/app/projects/[projectId]/review/human-review-panel";
import { getHumanReviewWorkspace } from "@/lib/services/human-review.service";
import { getJudgeReviewWorkspace, JudgeExecutionError, type JudgeReviewWorkspace } from "@/lib/services/judge.service";
import { getProjectWorkflowState } from "@/lib/services/workflow-navigation.service";

export const maxDuration = 300;

type ReviewPageProps = { params: Promise<{ projectId: string }> };

export default async function BlindReviewPage({ params }: ReviewPageProps) {
  await connection();
  const { projectId } = await params;
  const workflowStatePromise = getProjectWorkflowState(projectId);
  let workspace: JudgeReviewWorkspace | null = null;
  try {
    workspace = await getJudgeReviewWorkspace(projectId);
  } catch (error) {
    if (!(error instanceof JudgeExecutionError)) throw error;
  }
  if (!workspace) redirect(`/projects/${projectId}/test`);
  const workflowState = await workflowStatePromise;
  if (!workflowState) redirect("/projects");
  if (workspace.latestRun?.status === "completed") {
    const reviewWorkspace = await getHumanReviewWorkspace(projectId);
    if (!reviewWorkspace) redirect(`/projects/${projectId}/review`);
    return <HumanReviewPanel workspace={reviewWorkspace} workflowState={workflowState} />;
  }
  const run = workspace.latestRun;
  const singleProduct = workspace.samples.length === 1;
  const completedCases = run?.caseRuns.filter((caseRun) => caseRun.status === "completed").length ?? 0;
  const progress = workspace.testCases.length === 0 ? 0 : completedCases / workspace.testCases.length * 100;

  return (
    <div className="page-shell">
      <WorkflowSteps projectId={projectId} workflowState={workflowState} />
      <Link href={`/projects/${projectId}/test`} className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />返回测试执行</Link>
      <PageHeader eyebrow={`Blind Review / Protocol v${workspace.protocolVersion}`} title="产品身份已隐藏" description={singleProduct ? "AI Judge 在匿名状态下评价这次真实体验的原始 Artifact，不接收产品身份。" : "AI Judge 只接收匿名 Sample、锁定的测试方案与原始 Artifact，不接收产品身份映射。"} action={<Badge variant="success"><EyeOff className="h-3 w-3" />Blind 状态生效</Badge>} />

      <div className="mb-7 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" /><div><p className="text-sm font-semibold text-blue-950">身份映射仅保存在服务端</p><p className="mt-1 text-xs leading-5 text-blue-800/70">页面、Server Action 返回值与 Judge 输入均不包含 Product ID、产品名称或 Sample-to-Product Mapping。</p></div></div>

      <section>
        <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><EyeOff className="h-4 w-4 text-blue-700" /><h2 className="section-title">{singleProduct ? "匿名体验样本" : "Blind Samples"}</h2></div><span className="text-xs text-muted-foreground">{workspace.samples.length} 个匿名样本</span></div>
        <div className="grid gap-4 md:grid-cols-3">{workspace.samples.map((sample, index) => <Card key={sample.sampleId} className="p-5 shadow-none"><div className="flex items-start justify-between"><span className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-xs font-semibold">{String.fromCharCode(65 + index)}</span><Badge variant="neutral"><LockKeyhole className="h-3 w-3" />身份已封存</Badge></div><h3 className="mt-5 text-lg font-semibold">{sample.label}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">该匿名标识贯穿 AI Judge、人工复核与锁定阶段。</p></Card>)}</div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div><div className="mb-3 flex items-center gap-2"><FileCheck2 className="h-4 w-4 text-blue-700" /><h2 className="section-title">Test Cases</h2></div><Card className="divide-y shadow-none">{workspace.testCases.map((testCase) => { const caseRun = run?.caseRuns.find((item) => item.testCaseId === testCase.id); return <div key={testCase.id} className="flex items-center gap-4 px-4 py-3.5"><span className="font-mono text-[11px] text-blue-700">CASE {String(testCase.position).padStart(2, "0")}</span><span className="min-w-0 flex-1 text-sm font-medium">{testCase.title}</span>{caseRun && <Badge variant={caseRun.status === "completed" ? "success" : caseRun.status === "failed" ? "warning" : "neutral"}>{caseRun.status === "completed" ? "评分完成" : caseRun.status === "failed" ? "失败" : "评分中"}</Badge>}</div>; })}</Card></div>
        <JudgeStatus workspace={workspace} progress={progress} />
      </section>
    </div>
  );
}

function JudgeStatus({ workspace, progress }: { workspace: JudgeReviewWorkspace; progress: number }) {
  const run = workspace.latestRun;
  if (!run) return <aside className="h-fit rounded-lg border bg-slate-50 p-5"><div className="flex items-center gap-2"><Scale className="h-4 w-4 text-blue-700" /><h2 className="text-sm font-semibold">AI Judge</h2></div><p className="mt-3 text-sm leading-6 text-slate-700">系统会先检查每个 Test Case 的完整 Artifact 模态，再为该 Case 的全部 Sample 统一选择一个 Judge 路由。</p><div className="mt-5 border-t pt-4"><RunBlindJudgeAction projectId={workspace.projectId} /></div></aside>;
  if (run.status === "failed") return <aside className="h-fit rounded-lg border border-amber-200 bg-amber-50 p-5"><div className="flex items-center gap-2 text-amber-900"><AlertTriangle className="h-4 w-4" /><h2 className="text-sm font-semibold">AI Judge 未完成</h2></div><p className="mt-3 text-xs leading-5 text-amber-800/80">{run.errorMessage ?? "本次运行失败，已保留审计记录。"}</p><div className="mt-5 border-t border-amber-200 pt-4"><RunBlindJudgeAction projectId={workspace.projectId} retry /></div></aside>;
  if (run.status === "completed") return <aside className="h-fit rounded-lg border border-emerald-200 bg-emerald-50 p-5"><div className="flex items-center gap-2 text-emerald-800"><CheckCircle2 className="h-4 w-4" /><h2 className="text-sm font-semibold">AI Judge 已完成</h2></div><p className="mt-3 text-sm leading-6 text-emerald-900/80">{workspace.testCases.length} 个 Test Cases、{workspace.samples.length} 个 Sample 与 {workspace.rubric.length} 个 Rubric 维度已形成完整评分矩阵。</p><div className="mt-4 flex items-center justify-between border-t border-emerald-200 pt-4 text-xs"><span>评分项</span><strong className="tabular-nums">{run.scores.length}</strong></div></aside>;
  return <aside className="h-fit rounded-lg border bg-slate-50 p-5"><div className="flex items-center gap-2"><Scale className="h-4 w-4 animate-pulse text-blue-700" /><h2 className="text-sm font-semibold">AI Judge 进行中</h2></div><div className="mt-4 flex justify-between text-xs"><span className="text-muted-foreground">Case 进度</span><span className="font-medium tabular-nums">{run.caseRuns.filter((item) => item.status === "completed").length} / {workspace.testCases.length}</span></div><Progress className="mt-2" value={progress} /><p className="mt-4 text-xs leading-5 text-muted-foreground">请保持页面打开；评分结果会在本次运行完成后统一保存。</p></aside>;
}
