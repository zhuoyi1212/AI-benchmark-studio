import { Boxes, ArrowUpRight } from "lucide-react";
import { NavigationLink as Link } from "@/components/navigation-link";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { ProductLogo } from "@/components/product-logo";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { listProductLibrary } from "@/lib/services/product-library.service";

export default async function ProductsPage() {
  await connection();
  const products = await listProductLibrary();
  return <div className="page-shell">
    <PageHeader title="产品库" description="一个产品档案，积累每次独立测评。" />
    {products.length === 0 ? <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center shadow-none"><Boxes className="h-8 w-8 text-muted-foreground" /><p className="text-sm text-muted-foreground">新建测评后，产品会保存在这里</p><Link href="/projects/new" className="text-sm text-blue-700">开始第一次测评</Link></Card>
      : <div className="grid gap-4 xl:grid-cols-2">{products.map(product => <Card key={product.id} className="p-5 shadow-none">
        <div className="flex items-start gap-3"><ProductLogo name={product.name} initials={product.name.slice(0, 2).toUpperCase()} logoUrl={product.logoUrl ?? undefined} /><div className="min-w-0 flex-1"><Link href={`/products/${product.id}`} className="inline-flex items-center gap-2 font-semibold hover:text-blue-700">{product.name}<ArrowUpRight className="h-4 w-4" /></Link><p className="mt-2 text-xs leading-6 text-muted-foreground">{product.latestSnapshot?.positioning ?? "尚无调研资料，完成调研后可供后续测评复用。"}</p></div></div>
        <div className="mt-4 flex flex-wrap gap-2"><Badge variant="neutral">{product.projects.length} 次测评</Badge>{product.latestSnapshot && <Badge variant={product.latestSnapshot.needsUpdate ? "warning" : "success"}>{product.latestSnapshot.needsUpdate ? "资料可能过期 · " : ""}调研 v{product.latestSnapshot.version}</Badge>}</div>
        <div className="mt-4 flex gap-5 border-t pt-4 text-xs"><Link href={`/products/${product.id}`} className="text-blue-700">查看资料与测评</Link><Link href={`/projects/new?productId=${product.id}`} className="text-blue-700">开始新测评</Link></div>
      </Card>)}</div>}
  </div>;
}
