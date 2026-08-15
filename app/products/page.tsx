import { Boxes, Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ProductLogo } from "@/components/product-logo";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getProductsCatalog } from "@/lib/mock/services";

export default function ProductsPage() { const products = getProductsCatalog("demo"); return <div className="page-shell"><PageHeader title="产品库" description="集中维护候选 AI 产品及历史测评记录。" /><div className="relative max-w-sm"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="搜索产品" /></div><div className="mt-6 grid gap-4 lg:grid-cols-3">{products.map((item) => <Card key={item.productId} className="p-5 shadow-none"><div className="flex items-center gap-3"><ProductLogo initials={item.initials} name={item.name} /><div><h2 className="text-sm font-semibold">{item.name}</h2><Badge className="mt-1" variant="neutral"><Boxes className="h-3 w-3" />已调研产品</Badge></div></div><p className="mt-4 text-xs leading-6 text-muted-foreground">{item.positioning}</p><div className="mt-4 border-t pt-3 text-[11px] text-muted-foreground">{item.capabilities.length} 项核心能力 · {item.sources.length} 个调研来源</div></Card>)}</div></div>; }
