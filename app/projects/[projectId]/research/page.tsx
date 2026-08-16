import { ArrowLeft, ArrowRight, ExternalLink, FlaskConical } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { ProductLogo } from "@/components/product-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getProjectSummary } from "@/lib/services/projects.service";

type ResearchPageProps = { params: Promise<{ projectId: string }> };

export default async function ResearchPage({ params }: ResearchPageProps) {
  await connection();
  const { projectId } = await params;
  const project = await getProjectSummary(projectId);
  if (!project) notFound();

  return (
    <div className="page-shell max-w-[1080px]">
      <Link href="/projects" className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />返回我的测评</Link>
      <PageHeader
        eyebrow="产品调研"
        title={project.name}
        description="项目已保存。下一步将基于产品官网与可追溯来源完成产品调研。"
        action={<Badge variant="neutral">{project.status === "draft" ? "等待调研" : "调研中"}</Badge>}
      />
      <section className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div>
          <h2 className="section-title">待调研产品</h2>
          <div className="mt-3 space-y-3">
            {project.products.map((product, index) => (
              <Card key={product.id} className="flex items-center gap-4 p-5 shadow-none">
                <ProductLogo initials={product.initials} name={product.name} />
                <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-[11px] font-medium text-muted-foreground">{String(index + 1).padStart(2, "0")}</span><h3 className="font-semibold">{product.name}</h3></div>{product.officialUrl ? <a href={product.officialUrl} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex max-w-full items-center gap-1 truncate text-xs text-blue-700 hover:underline">{product.officialUrl}<ExternalLink className="h-3 w-3 shrink-0" /></a> : <p className="mt-1.5 text-xs text-muted-foreground">未提供官网，将在调研阶段识别官方来源。</p>}</div>
                <Badge variant="outline">未开始</Badge>
              </Card>
            ))}
          </div>
        </div>
        <aside className="h-fit rounded-lg border bg-slate-50 p-5">
          <div className="flex items-center gap-2"><FlaskConical className="h-4 w-4 text-blue-700" /><h2 className="text-sm font-semibold">测评目标</h2></div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{project.intent}</p>
          <div className="mt-5 border-t pt-4"><p className="text-xs leading-5 text-muted-foreground">产品调研与可比性分析将在 M4 通过真实 AI Provider 流程完成，当前不会生成或回退 Mock 结果。</p></div>
        </aside>
      </section>
      <div className="mt-8 flex justify-end border-t pt-5"><Button disabled>开始产品调研<ArrowRight className="h-4 w-4" /></Button></div>
    </div>
  );
}
