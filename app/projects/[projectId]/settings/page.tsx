import { ArrowLeft, Settings2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ModeSelector } from "@/app/projects/[projectId]/settings/mode-selector";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { getProjectSummary } from "@/lib/services/projects.service";
import { getProtocolWorkspace } from "@/lib/services/protocols.service";

export default async function ProjectSettingsPage({ params }: { params: Promise<{ projectId: string }> }) {
  await connection();
  const { projectId } = await params;
  const [project, protocol] = await Promise.all([getProjectSummary(projectId), getProtocolWorkspace(projectId)]);
  if (!project) notFound();
  const locked = protocol?.protocol?.status === "locked";
  return <div className="page-shell">
    <Link href={`/projects/${projectId}/protocol`} className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />返回项目</Link>
    <PageHeader eyebrow={`项目 / ${project.name}`} title="项目设置" description="模式决定协议规模与自动推进方式，不改变 Blind、审计和 Protocol Lock 规则。" />
    <Card className="max-w-2xl p-5 shadow-none"><div className="mb-5 flex items-center gap-2 border-b pb-4"><Settings2 className="h-4 w-4 text-blue-700" /><h2 className="text-sm font-semibold">测评模式</h2></div><ModeSelector projectId={projectId} initialMode={project.evaluationMode} disabled={locked} /></Card>
  </div>;
}
