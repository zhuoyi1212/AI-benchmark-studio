import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { ProjectForm } from "@/app/projects/new/project-form";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { listProductOptions } from "@/lib/services/product-library.service";

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ productId?: string }> }) {
  await connection();
  const [options, query] = await Promise.all([listProductOptions(), searchParams]);
  const initialProduct = query.productId ? options.find(product => product.id === query.productId) : undefined;
  if (query.productId && !initialProduct) notFound();
  return (
    <div className="page-shell max-w-[980px]">
      <Link href="/projects" className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />返回我的测评</Link>
      <PageHeader title="新建测评" description="可以深入体验一款产品，也可以使用统一任务横向比较多款产品。项目保存后将进入产品调研。" />
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Card className="p-6 shadow-none"><ProjectForm productOptions={options} initialProduct={initialProduct} /></Card>
        <aside className="h-fit rounded-lg border bg-slate-50 p-5">
          <div className="eyebrow">两种模式</div>
          <div className="mt-4 space-y-4 text-xs leading-5 text-slate-600">
            <div><div className="font-semibold text-slate-900">单品体验 · 1 个产品</div><p className="mt-1">研究产品定位与能力，生成高价值体验任务，最后形成真实体验报告。</p></div>
            <div className="border-t pt-4"><div className="font-semibold text-slate-900">横向对比 · 2–3 个产品</div><p className="mt-1">先判断可比性，再生成共同任务与统一评分框架。</p></div>
          </div>
          <p className="mt-5 border-t pt-4 text-[11px] leading-5 text-muted-foreground">模式会根据产品数量自动判断，不需要额外配置。</p>
        </aside>
      </div>
    </div>
  );
}
