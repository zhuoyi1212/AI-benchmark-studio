import { Boxes, ArrowUpRight } from "lucide-react";
import { NavigationLink as Link } from "@/components/navigation-link";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { ProductLogo } from "@/components/product-logo";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { listProductLibrary } from "@/lib/services/product-library.service";
import { ProductActions } from "@/app/products/product-actions";
import { AdminOnly } from "@/components/workspace-access";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await connection();
  const archived = (await searchParams).view === "deleted";
  const products = await listProductLibrary(undefined, archived);
  return <div className="page-shell">
    <PageHeader title="产品库" description="只收录已有原始测试结果的产品。" />
    <nav aria-label="产品列表" className="mb-6 flex gap-5 border-b pb-3 text-sm"><Link href="/products" aria-current={!archived ? "page" : undefined} className={!archived ? "font-medium text-blue-700" : "text-muted-foreground"}>已测产品</Link><AdminOnly><Link href="/products?view=deleted" aria-current={archived ? "page" : undefined} className={archived ? "font-medium text-blue-700" : "text-muted-foreground"}>已删除</Link></AdminOnly></nav>
    {products.length === 0 ? <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center shadow-none"><Boxes className="h-8 w-8 text-muted-foreground" /><p className="text-sm text-muted-foreground">{archived ? "暂无已删除产品" : "暂无已测产品，上传原始测试结果后会自动收录"}</p>{!archived && <AdminOnly><Link href="/projects/new" className="text-sm text-blue-700">开始第一次测评</Link></AdminOnly>}</Card>
      : <div className="grid gap-4 xl:grid-cols-2">{products.map(product => <Card key={product.id} className="p-5 shadow-none">
        <div className="flex items-start gap-3"><ProductLogo name={product.name} initials={product.name.slice(0, 2).toUpperCase()} logoUrl={product.logoUrl ?? undefined} /><div className="min-w-0 flex-1">{archived ? <p className="font-semibold">{product.name}</p> : <Link href={`/products/${product.id}`} className="inline-flex items-center gap-2 font-semibold hover:text-blue-700">{product.name}<ArrowUpRight className="h-4 w-4" /></Link>}<p className="mt-2 text-xs leading-6 text-muted-foreground">{product.latestSnapshot?.positioning ?? "尚无调研资料，完成调研后可供后续测评复用。"}</p></div><ProductActions productId={product.id} productName={product.name} archived={archived} /></div>
        <div className="mt-4 flex flex-wrap gap-2"><Badge variant="neutral">{product.projects.length} 次测评</Badge>{product.latestSnapshot && <Badge variant={product.latestSnapshot.needsUpdate ? "warning" : "success"}>{product.latestSnapshot.needsUpdate ? "资料可能过期 · " : ""}调研 v{product.latestSnapshot.version}</Badge>}</div>
        {!archived && <div className="mt-4 flex gap-5 border-t pt-4 text-xs"><Link href={`/products/${product.id}`} className="text-blue-700">查看资料与测评</Link><AdminOnly><Link href={`/projects/new?productId=${product.id}`} className="text-blue-700">开始新测评</Link></AdminOnly></div>}
      </Card>)}</div>}
  </div>;
}
