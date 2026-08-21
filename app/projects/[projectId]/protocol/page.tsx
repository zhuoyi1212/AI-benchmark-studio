import { ArrowLeft, FileText, LockKeyhole, ShieldAlert, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GenerateProtocolAction } from "@/app/projects/[projectId]/protocol/protocol-actions";
import { ProtocolView } from "@/app/projects/[projectId]/protocol/protocol-view";
import { getProjectMode } from "@/lib/project-mode";
import { getProtocolWorkspace } from "@/lib/services/protocols.service";

export const maxDuration = 300;

type ProtocolPageProps = { params: Promise<{ projectId: string }> };

export default async function ProtocolPage({ params }: ProtocolPageProps) {
  await connection();
  const { projectId } = await params;
  const workspace = await getProtocolWorkspace(projectId);
  if (!workspace) notFound();

  const { research, protocol, versionCount } = workspace;
  const completedResearch = research.completedResult;
  const projectMode = getProjectMode(research.project.products);
  const canGenerate = Boolean(completedResearch) && (projectMode === "single" || completedResearch!.comparability.status !== "not_comparable");

  return (
    <div className="page-shell">
      <Link href={`/projects/${projectId}/research`} className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />返回产品调研</Link>
      <PageHeader
        eyebrow={`项目 / ${research.project.name}`}
        title={protocol?.title ?? "Test Protocol"}
        description={protocol ? `Protocol v${protocol.version} · 来源 ResearchRun ${completedResearch?.researchRunId === protocol.researchRunId ? `v${completedResearch.version}` : protocol.researchRunId}` : projectMode === "single" ? "根据项目目标与产品调研，生成可复现、可留证的真实体验方案。" : "根据项目目标、结构化产品调研与可比性结论，生成公平、可复现的测试方案。"}
        action={protocol ? <Badge variant={protocol.status === "locked" ? "success" : "warning"}>{protocol.status === "locked" ? <LockKeyhole className="h-3 w-3" /> : <FileText className="h-3 w-3" />}{protocol.status === "locked" ? "已锁定" : "草稿"}</Badge> : undefined}
      />

      {versionCount > 1 && <p className="mb-5 text-xs text-muted-foreground">已保留 {versionCount} 个 Protocol 版本；当前展示最新版本，历史锁定版本未被覆盖。</p>}

      {protocol ? <ProtocolView protocol={protocol} productCount={research.project.products.length} canRegenerate={["research_ready", "protocol_draft", "protocol_locked"].includes(research.project.status)} /> : (
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="flex min-h-64 flex-col items-center justify-center p-8 text-center shadow-none">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-blue-50 text-blue-700"><Sparkles className="h-5 w-5" /></div>
            <h2 className="mt-4 text-lg font-semibold">生成第一版{projectMode === "single" ? "体验" : "测评"}方案</h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">Test Cases 与 Rubric 将根据本项目的产品类别和{projectMode === "single" ? "核心体验能力" : "共同能力"}动态生成，并在保存前验证权重合计为 100%。</p>
            <div className="mt-6">{canGenerate ? <GenerateProtocolAction projectId={projectId} experienceMode={projectMode === "single"} /> : <Button asChild variant="outline"><Link href={`/projects/${projectId}/research`}>返回完成{projectMode === "single" ? "产品调研" : "可比性检查"}</Link></Button>}</div>
          </Card>
          <aside className="h-fit rounded-lg border bg-slate-50 p-5">
            <div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-blue-700" /><h2 className="text-sm font-semibold">生成边界</h2></div>
            <ul className="mt-4 space-y-2 text-xs leading-5 text-muted-foreground"><li>· 仅使用指定 ResearchRun 中已保存的数据</li><li>· 不读取任何测试输出或品牌表现结果</li><li>· {projectMode === "single" ? "每个体验任务使用锁定的 Prompt 与输入" : "同 Case 对所有产品使用相同 Prompt 与输入"}</li><li>· 锁定前必须通过动态 Rubric 权重校验</li></ul>
            {completedResearch && <div className="mt-5 border-t pt-4 text-xs text-muted-foreground">数据源：ResearchRun v{completedResearch.version}<br />{projectMode === "single" ? "体验范围" : "可比性"}：{completedResearch.comparability.status}</div>}
          </aside>
        </section>
      )}
    </div>
  );
}
