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
  const singleMode = projectMode === "single";
  const canGenerate = Boolean(completedResearch) && (singleMode || completedResearch!.comparability.status !== "not_comparable");

  return (
    <div className="page-shell">
      <Link href={`/projects/${projectId}/research`} className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />返回产品调研</Link>
      <PageHeader
        eyebrow={`项目 / ${research.project.name}`}
        title={protocol?.title ?? (singleMode ? "体验方案" : "Test Protocol")}
        description={protocol
          ? `Protocol v${protocol.version} · 来源 ResearchRun ${completedResearch?.researchRunId === protocol.researchRunId ? `v${completedResearch.version}` : protocol.researchRunId}`
          : singleMode
            ? "根据你的体验目标与结构化产品调研，生成高价值、可留证的真实体验任务。"
            : "根据项目目标、结构化产品调研与可比性结论，生成公平、可复现的测试方案。"}
        action={protocol ? <Badge variant={protocol.status === "locked" ? "success" : "warning"}>{protocol.status === "locked" ? <LockKeyhole className="h-3 w-3" /> : <FileText className="h-3 w-3" />}{protocol.status === "locked" ? "已锁定" : "草稿"}</Badge> : undefined}
      />

      {versionCount > 1 && <p className="mb-5 text-xs text-muted-foreground">已保留 {versionCount} 个 Protocol 版本；当前展示最新版本，历史锁定版本未被覆盖。</p>}

      {protocol ? <ProtocolView protocol={protocol} productCount={research.project.products.length} canRegenerate={["research_ready", "protocol_draft", "protocol_locked"].includes(research.project.status)} /> : (
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="flex min-h-64 flex-col items-center justify-center p-8 text-center shadow-none">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-blue-50 text-blue-700"><Sparkles className="h-5 w-5" /></div>
            <h2 className="mt-4 text-lg font-semibold">{singleMode ? "生成第一版体验方案" : "生成第一版测评方案"}</h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{singleMode ? "系统会挑选最值得真实体验的核心场景，并为每个任务设计可由原始证据验证的评分维度。" : "Test Cases 与 Rubric 将根据本项目的产品类别和共同能力动态生成，并在保存前验证权重合计为 100%。"}</p>
            <div className="mt-6">{canGenerate ? <GenerateProtocolAction projectId={projectId} /> : <Button asChild variant="outline"><Link href={`/projects/${projectId}/research`}>返回完成可比性检查</Link></Button>}</div>
          </Card>
          <aside className="h-fit rounded-lg border bg-slate-50 p-5">
            <div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-blue-700" /><h2 className="text-sm font-semibold">生成边界</h2></div>
            <ul className="mt-4 space-y-2 text-xs leading-5 text-muted-foreground">
              <li>· 仅使用指定 ResearchRun 中已保存的数据</li>
              <li>· 不读取任何测试输出或品牌表现结果</li>
              <li>{singleMode ? "· 任务聚焦核心能力、真实场景、卖点验证与明显优缺点" : "· 同 Case 对所有产品使用相同 Prompt 与输入"}</li>
              <li>· 锁定前必须通过动态 Rubric 权重校验</li>
            </ul>
            {completedResearch && <div className="mt-5 border-t pt-4 text-xs text-muted-foreground">数据源：ResearchRun v{completedResearch.version}<br />模式：{singleMode ? "单品体验" : `横向对比 · ${completedResearch.comparability.status}`}</div>}
          </aside>
        </section>
      )}
    </div>
  );
}
