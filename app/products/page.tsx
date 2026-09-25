import { Boxes, ExternalLink, History, RefreshCw } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { ProductLogo } from "@/components/product-logo";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { listProductLibrary } from "@/lib/services/product-library.service";

export default async function ProductsPage() {
  await connection();
  const products = await listProductLibrary();
  return (
    <div className="page-shell">
      <PageHeader title="产品库" description="已完成的产品调研会保存为可复用版本，新项目优先引用最新快照。" />
      {products.length === 0 ? <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center shadow-none">
        <Boxes className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">完成一次真实产品调研后会出现在这里</p>
      </Card> : <div className="grid gap-4 xl:grid-cols-2">{products.map((product) => {
        const snapshot = product.latestSnapshot!;
        return <Card key={product.id} className="p-5 shadow-none">
          <div className="flex items-start gap-3"><ProductLogo name={product.name} initials={product.name.slice(0, 2).toUpperCase()} logoUrl={product.logoUrl ?? undefined} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{product.name}</h2><Badge variant={snapshot.needsUpdate ? "warning" : "success"}>调研 v{snapshot.version}</Badge>{snapshot.needsUpdate && <Badge variant="warning"><RefreshCw className="h-3 w-3" />资料可能过期</Badge>}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">{snapshot.positioning}</p>{product.officialUrl && <a href={product.officialUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-blue-700 hover:underline">产品官网<ExternalLink className="h-3 w-3" /></a>}</div></div>
          <div className="mt-5 grid gap-4 border-t pt-4 sm:grid-cols-2"><Info label="核心能力" values={snapshot.capabilities} /><Info label="输入格式" values={snapshot.inputFormats} /><Info label="输出格式" values={snapshot.outputFormats} /><Info label="已知限制" values={snapshot.limitations} /></div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-[11px] text-muted-foreground"><span>最近调研 {formatDate(snapshot.researchedAt)} · {snapshot.sources.length} 个来源 · 共 {product.snapshotCount} 个版本</span><span className="inline-flex items-center gap-1"><History className="h-3.5 w-3.5" />参与 {product.projects.length} 个项目</span></div>
          {product.projects.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{product.projects.slice(0, 4).map((project) => <Link key={project.id} href={`/projects/${project.id}/research`} className="rounded-md border bg-slate-50 px-2.5 py-1 text-[11px] hover:border-blue-200 hover:text-blue-700">{project.name}</Link>)}</div>}
        </Card>;
      })}</div>}
    </div>
  );
}

function Info({ label, values }: { label: string; values: string[] }) {
  return <div><div className="text-[11px] font-medium text-slate-500">{label}</div><div className="mt-2 flex flex-wrap gap-1.5">{values.length ? values.slice(0, 8).map((value) => <Badge key={value} variant="neutral">{value}</Badge>) : <span className="text-xs text-muted-foreground">尚未确认</span>}</div></div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(value));
}
