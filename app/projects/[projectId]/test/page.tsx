import { withPageReads } from "@/lib/supabase/read-scope";
import { ArrowLeft, CheckCircle2, Clock3, Download, ExternalLink, FileText, FileUp, ImageIcon, LockKeyhole, RotateCcw, Video } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { ProductLogo } from "@/components/product-logo";
import { WorkflowSteps } from "@/components/workflow-steps";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CopyPromptButton, FinalizeExecutionAction, ProfessionalReviewAction, UploadArtifactAction } from "@/app/projects/[projectId]/test/test-actions";
import { QuickAutoAdvance } from "@/app/projects/[projectId]/test/quick-auto-advance";
import { getTestExecutionWorkspace } from "@/lib/services/test-execution.service";
import { getProjectWorkflowState } from "@/lib/services/workflow-navigation.service";
import type { TestArtifact } from "@/lib/types/test-run";

export const maxDuration = 300;

type TestPageProps = { params: Promise<{ projectId: string }> };

async function TestPage({ params }: TestPageProps) {
  await connection();
  const { projectId } = await params;
  const [workspace, workflowState] = await Promise.all([
    getTestExecutionWorkspace(projectId),
    getProjectWorkflowState(projectId),
  ]);
  if (!workspace) redirect(`/projects/${projectId}/protocol`);
  if (!workflowState) redirect("/projects");

  const { project, protocol, testRuns } = workspace;
  const completed = testRuns.filter((run) => run.status === "uploaded" || run.status === "ready_for_review").length;
  const total = testRuns.length;
  const progress = total === 0 ? 0 : completed / total * 100;
  const allUploaded = total > 0 && completed === total;
  const allReady = testRuns.every((run) => run.status === "ready_for_review");
  const hasMissingInputs = protocol.testCases.some((testCase) => testCase.inputArtifacts?.some((artifact) => !artifact.downloadUrl));

  return (
    <div className="page-shell">
      <WorkflowSteps projectId={projectId} workflowState={workflowState} />
      <Link href={`/projects/${projectId}/protocol`} className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />返回调整任务</Link>
      <PageHeader eyebrow={`项目 / ${project.name}`} title="测试执行" description={`严格按 Protocol v${protocol.version} 在各产品中执行相同任务，并保存未经修饰的原始输出。`} action={<Badge variant="success"><LockKeyhole className="h-3 w-3" />Protocol v{protocol.version} 已锁定</Badge>} />
      {hasMissingInputs && <div className="mb-5 flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-amber-950">当前任务来自旧版 Protocol，缺少输入文件</p><p className="mt-1 text-xs leading-5 text-amber-800">返回任务页生成新版本，下载完整输入文件后再执行。当前版本和已有上传记录会保留。</p></div><Button asChild variant="outline" className="shrink-0 border-amber-300 bg-white text-amber-950 hover:bg-amber-100"><Link href={`/projects/${projectId}/protocol`}><RotateCcw className="h-4 w-4" />重新生成任务</Link></Button></div>}
      <Card className="mb-7 p-5 shadow-none"><div className="flex flex-col gap-5 sm:flex-row sm:items-center"><div className="grid h-11 w-11 place-items-center rounded-lg bg-blue-50 text-blue-600"><FileUp className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex justify-between gap-4"><span className="text-sm font-semibold">总体进度</span><span className="text-sm font-semibold tabular-nums">{completed} / {total} 项已上传</span></div><Progress className="mt-3" value={progress} /></div><span className="text-2xl font-semibold tabular-nums text-blue-700">{Math.round(progress)}%</span></div></Card>

      <div className="space-y-6">{protocol.testCases.map((testCase, caseIndex) => <section key={testCase.id}><div className="mb-2.5 flex items-center justify-between gap-4"><div className="flex items-center gap-3"><span className="font-mono text-[11px] font-medium text-blue-600">CASE {String(caseIndex + 1).padStart(2, "0")}</span><h2 className="text-sm font-semibold">{testCase.title}</h2></div><CopyPromptButton prompt={testCase.prompt} /></div>{testCase.inputArtifacts && testCase.inputArtifacts.length > 0 && <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2"><span className="text-xs font-semibold text-blue-950">任务输入</span>{testCase.inputArtifacts.map((artifact) => artifact.downloadUrl ? <a key={artifact.id} href={artifact.downloadUrl} download className="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-blue-700 shadow-sm hover:bg-blue-100"><FileText className="h-3.5 w-3.5" />{artifact.name}<Download className="h-3.5 w-3.5" /></a> : <span key={artifact.id} className="text-xs text-amber-800">旧版本缺少“{artifact.name}”，请重新生成 Protocol</span>)}</div>}<div className="mb-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground"><span>输出参考：</span>{testCase.expectedOutputTypes.map((type) => <Badge key={type} variant="neutral">{type}</Badge>)}<span className="ml-1">证据参考：{testCase.evidenceRequirements.join("；")}</span></div><Card className="divide-y shadow-none">{project.products.map((product) => { const run = testRuns.find((item) => item.testCaseId === testCase.id && item.productId === product.id); if (!run) return null; const done = run.status === "uploaded" || run.status === "ready_for_review"; return <div key={product.id} className="p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><ProductLogo initials={product.initials} name={product.name} className="h-8 w-8 rounded-md text-xs" /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-sm font-medium">{product.name}</span>{run.status === "ready_for_review" && <Badge variant="neutral">已确认</Badge>}</div><div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">{done ? <><span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-600" />{run.artifacts.length} 个原始文件</span>{run.generationTimeSeconds !== undefined && <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{run.generationTimeSeconds}s</span>}<span className="inline-flex items-center gap-1"><RotateCcw className="h-3 w-3" />重试 {run.retryCount ?? 0}</span>{run.manuallyEdited && <span className="text-amber-700">已记录人工编辑</span>}</> : <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />等待执行与上传</span>}</div></div>{run.status !== "ready_for_review" && <UploadArtifactAction projectId={project.id} run={run} productName={product.name} />}</div>{run.artifacts.length > 0 && <div className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-2 lg:grid-cols-3">{run.artifacts.map((artifact) => <ArtifactItem key={artifact.id} artifact={artifact} />)}</div>}{run.notes && <p className="mt-2 text-[11px] leading-5 text-muted-foreground">备注：{run.notes}</p>}</div>; })}</Card></section>)}</div>

      <div className="sticky bottom-5 z-20 mt-8 flex items-center justify-between gap-4 rounded-lg border bg-white/95 p-3 shadow-lg backdrop-blur"><div className="hidden pl-2 sm:block"><p className="text-xs font-medium">{allReady ? "测试数据已确认" : allUploaded ? "全部原始结果已上传" : `还需上传 ${total - completed} 项结果`}</p><p className="mt-0.5 text-[10px] text-muted-foreground">每个产品的每个任务至少上传 1 个原始文件即可进入分析。</p></div>{project.evaluationMode === "quick" && allUploaded ? <QuickAutoAdvance projectId={project.id} protocolId={protocol.id} countdown={!allReady} /> : allReady ? <ProfessionalReviewAction projectId={project.id} protocolId={protocol.id} label="开始 Blind Judge" /> : allUploaded ? <FinalizeExecutionAction projectId={project.id} protocolId={protocol.id} /> : <Badge variant="neutral">等待完整上传</Badge>}</div>
    </div>
  );
}

function ArtifactItem({ artifact }: { artifact: TestArtifact }) {
  if (artifact.kind === "video" && artifact.fileUrl) {
    return <div className="rounded-md border bg-slate-50 p-2"><video src={artifact.fileUrl} controls preload="metadata" className="aspect-video w-full rounded bg-black" /><div className="mt-2 flex min-w-0 items-center gap-2"><Video className="h-4 w-4 text-slate-500" /><span className="min-w-0 flex-1 truncate text-xs font-medium">{artifact.fileName}</span><a href={artifact.fileUrl} target="_blank" rel="noreferrer" aria-label="打开原始视频"><ExternalLink className="h-3.5 w-3.5 text-slate-400" /></a></div></div>;
  }
  const Icon = artifact.kind === "image" ? ImageIcon : FileText;
  return <a href={artifact.fileUrl} target="_blank" rel="noreferrer" className="group flex min-w-0 items-center gap-2.5 rounded-md border bg-slate-50 px-3 py-2 hover:border-blue-200 hover:bg-blue-50/50">{artifact.previewUrl ? <img src={artifact.previewUrl} alt="" className="h-9 w-11 rounded border object-cover" /> : <span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-white text-slate-500"><Icon className="h-4 w-4" /></span>}<span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{artifact.fileName}</span><span className="text-[10px] text-muted-foreground">{formatBytes(artifact.sizeBytes)}</span></span><ExternalLink className="h-3 w-3 shrink-0 text-slate-400 group-hover:text-blue-600" /></a>;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default withPageReads(TestPage);
