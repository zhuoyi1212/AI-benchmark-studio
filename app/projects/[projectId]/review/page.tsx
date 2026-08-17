import { ArrowLeft, EyeOff, FileCheck2, LockKeyhole, Scale, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  BlindReviewError,
  getBlindReviewWorkspace,
  type BlindReviewWorkspace,
} from "@/lib/services/blind-review.service";

type ReviewPageProps = { params: Promise<{ projectId: string }> };

export default async function BlindReviewPage({ params }: ReviewPageProps) {
  await connection();
  const { projectId } = await params;
  let workspace: BlindReviewWorkspace | null = null;
  try {
    workspace = await getBlindReviewWorkspace(projectId);
  } catch (error) {
    if (!(error instanceof BlindReviewError)) throw error;
  }
  if (!workspace) redirect(`/projects/${projectId}/test`);

  return (
    <div className="page-shell">
      <Link href={`/projects/${projectId}/test`} className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />返回测试执行</Link>
      <PageHeader eyebrow={`Blind Review / Protocol v${workspace.protocolVersion}`} title="产品身份已隐藏" description="匿名 Sample 已稳定生成。后续 AI Judge 与人工复核只使用 Sample 标识，不接收真实产品映射。" action={<Badge variant="success"><EyeOff className="h-3 w-3" />Blind 状态生效</Badge>} />

      <div className="mb-7 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" /><div><p className="text-sm font-semibold text-blue-950">身份映射仅保存在服务端</p><p className="mt-1 text-xs leading-5 text-blue-800/70">本页面、客户端数据与后续 Judge 输入均不包含 Product ID、产品名称或 Sample-to-Product Mapping。</p></div></div>

      <section>
        <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><EyeOff className="h-4 w-4 text-blue-700" /><h2 className="section-title">Blind Samples</h2></div><span className="text-xs text-muted-foreground">{workspace.samples.length} 个匿名样本</span></div>
        <div className="grid gap-4 md:grid-cols-3">{workspace.samples.map((sample, index) => <Card key={sample.sampleId} className="p-5 shadow-none"><div className="flex items-start justify-between"><span className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-xs font-semibold">{String.fromCharCode(65 + index)}</span><Badge variant="neutral"><LockKeyhole className="h-3 w-3" />身份已封存</Badge></div><h3 className="mt-5 text-lg font-semibold">{sample.label}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">稳定匿名标识将在 Judge、人工复核和锁定阶段持续使用。</p></Card>)}</div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div><div className="mb-3 flex items-center gap-2"><FileCheck2 className="h-4 w-4 text-blue-700" /><h2 className="section-title">待评测 Test Cases</h2></div><Card className="divide-y shadow-none">{workspace.testCases.map((testCase) => <div key={testCase.id} className="flex items-center gap-4 px-4 py-3.5"><span className="font-mono text-[11px] text-blue-700">CASE {String(testCase.position).padStart(2, "0")}</span><span className="text-sm font-medium">{testCase.title}</span></div>)}</Card></div>
        <aside className="h-fit rounded-lg border bg-slate-50 p-5"><div className="flex items-center gap-2"><Scale className="h-4 w-4 text-blue-700" /><h2 className="text-sm font-semibold">AI Judge</h2></div><p className="mt-3 text-sm leading-6 text-slate-700">Blind Layer 已就绪。下一阶段将按每个 Test Case 的完整 Artifact 模态统一选择 Judge 路由。</p><div className="mt-5 border-t pt-4"><Badge variant="neutral">尚未开始评分</Badge></div></aside>
      </section>
    </div>
  );
}
