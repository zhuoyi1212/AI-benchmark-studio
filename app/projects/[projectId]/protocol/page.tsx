import { ArrowLeft, FileText, LoaderCircle, LockKeyhole, Settings2, ShieldAlert, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { AutoRefresh } from "@/components/auto-refresh";
import { WorkflowSteps } from "@/components/workflow-steps";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GenerateProtocolAction } from "@/app/projects/[projectId]/protocol/protocol-actions";
import { ProtocolView } from "@/app/projects/[projectId]/protocol/protocol-view";
import { getProjectMode } from "@/lib/project-mode";
import { getProtocolWorkspace } from "@/lib/services/protocols.service";
import { getProjectWorkflowState } from "@/lib/services/workflow-navigation.service";

export const maxDuration = 300;

type ProtocolPageProps = { params: Promise<{ projectId: string }> };

export default async function ProtocolPage({ params }: ProtocolPageProps) {
  await connection();
  const { projectId } = await params;
  const [workspace, workflowState] = await Promise.all([
    getProtocolWorkspace(projectId),
    getProjectWorkflowState(projectId),
  ]);
  if (!workspace) notFound();
  if (!workflowState) notFound();

  const { research, protocol, versionCount } = workspace;
  const completedResearch = research.completedResult;
  const projectMode = getProjectMode(research.project.products);
  const canGenerate = Boolean(completedResearch) && (projectMode === "single" || completedResearch!.comparability.status !== "not_comparable");
  const preparationTimedOut = research.project.quickPreparation.status === "running"
    && Date.now() - new Date(research.project.updated_at).getTime() > 10 * 60 * 1000;
  const autoPreparing = !preparationTimedOut && (research.project.quickPreparation.status === "running"
    || (research.project.evaluationMode === "quick" && !protocol && research.project.quickPreparation.status === "idle"));
  const preparationFailed = research.project.quickPreparation.status === "failed" || preparationTimedOut;
  const currentProtocol = protocol && protocol.researchRunId === completedResearch?.researchRunId ? protocol : null;
  const displayedProtocol = autoPreparing ? null : currentProtocol;

  return (
    <div className="page-shell">
      {autoPreparing && <AutoRefresh maxRefreshes={100} />}
      <WorkflowSteps projectId={projectId} workflowState={workflowState} />
      <Link href={`/projects/${projectId}/research`} className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />返回产品调研</Link>
      <PageHeader
        eyebrow={`项目 / ${research.project.name}`}
        title={displayedProtocol?.title ?? "Test Protocol"}
        description={displayedProtocol ? `Protocol v${displayedProtocol.version} · 来源 ResearchRun ${completedResearch?.researchRunId === displayedProtocol.researchRunId ? `v${completedResearch.version}` : displayedProtocol.researchRunId}` : projectMode === "single" ? "根据项目目标与产品调研，生成可复现、可留证的真实体验方案。" : "根据项目目标、结构化产品调研与可比性结论，生成公平、可复现的测试方案。"}
        action={<div className="flex items-center gap-2"><Badge variant="neutral">{research.project.evaluationMode === "quick" ? "快速模式" : "专业模式"}</Badge><Button variant="outline" size="sm" asChild><Link href={`/projects/${projectId}/settings`}><Settings2 className="h-3.5 w-3.5" />项目设置</Link></Button>{displayedProtocol && <Badge variant={displayedProtocol.status === "locked" ? "success" : "warning"}>{displayedProtocol.status === "locked" ? <LockKeyhole className="h-3 w-3" /> : <FileText className="h-3 w-3" />}{displayedProtocol.status === "locked" ? "已锁定" : "草稿"}</Badge>}</div>}
      />

      {versionCount > 1 && <p className="mb-5 text-xs text-muted-foreground">已保留 {versionCount} 个 Protocol 版本；当前展示最新版本，历史锁定版本未被覆盖。</p>}
      {preparationFailed && <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-semibold text-amber-950">方案未能自动完成</p><p className="mt-1 text-xs leading-5 text-amber-800">{preparationTimedOut ? "自动准备超过 10 分钟，已停止等待。可以直接重试当前步骤。" : research.project.quickPreparation.error ?? "请返回产品调研查看失败原因并重试。"}</p></div>}

      {displayedProtocol ? <ProtocolView protocol={displayedProtocol} productCount={research.project.products.length} evaluationMode={research.project.evaluationMode} canRegenerate={canGenerate} preserveHistory={displayedProtocol.status === "locked" || workflowState.stages.test.completed} /> : (
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="flex min-h-64 flex-col items-center justify-center p-8 text-center shadow-none">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-blue-50 text-blue-700"><Sparkles className="h-5 w-5" /></div>
            <h2 className="mt-4 text-lg font-semibold">生成第一版{projectMode === "single" ? "体验" : "测评"}方案</h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{research.project.evaluationMode === "quick" ? "快速模式生成 1 个最有代表性、可执行、可留证的核心任务。" : "专业模式生成 2–4 个覆盖不同能力的任务，并保留完整 Rubric。"}</p>
            <div className="mt-6">{autoPreparing ? <Button size="lg" disabled><LoaderCircle className="h-4 w-4 animate-spin" />正在自动准备方案...</Button> : canGenerate ? <GenerateProtocolAction projectId={projectId} experienceMode={projectMode === "single"} /> : <Button asChild variant="outline"><Link href={`/projects/${projectId}/research`}>返回完成{projectMode === "single" ? "产品调研" : "可比性检查"}</Link></Button>}</div>
          </Card>
          <aside className="h-fit rounded-lg border bg-slate-50 p-5">
            <div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-blue-700" /><h2 className="text-sm font-semibold">生成边界</h2></div>
            <ul className="mt-4 space-y-2 text-xs leading-5 text-muted-foreground"><li>· 仅使用指定 ResearchRun 中已保存的数据</li><li>· 不读取任何测试输出或品牌表现结果</li><li>· {projectMode === "single" ? "每个体验任务使用锁定的 Prompt 与输入" : "同 Case 对所有产品使用相同 Prompt 与输入"}</li><li>· 主流程关注任务、观察重点与需要保留的真实证据</li></ul>
            {completedResearch && <div className="mt-5 border-t pt-4 text-xs text-muted-foreground">数据源：ResearchRun v{completedResearch.version}<br />{projectMode === "single" ? "体验范围" : "可比性"}：{completedResearch.comparability.status}</div>}
          </aside>
        </section>
      )}
    </div>
  );
}
