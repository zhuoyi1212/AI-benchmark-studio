import { Boxes } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";

export default function ProductsPage() {
  return (
    <div className="page-shell">
      <PageHeader title="产品库" />
      <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center shadow-none">
        <Boxes className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">暂无产品</p>
      </Card>
    </div>
  );
}
