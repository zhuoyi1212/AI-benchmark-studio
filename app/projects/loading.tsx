import { LoaderCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProjectsLoading() {
  return <div className="page-shell" role="status" aria-label="正在加载页面">
    <div className="mb-8 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />正在加载…</div>
    <Skeleton className="h-7 w-64 max-w-full" />
    <Skeleton className="mt-4 h-4 w-[480px] max-w-full" />
    <div className="mt-8 grid gap-6 lg:grid-cols-[208px_minmax(0,1fr)]"><Skeleton className="h-56" /><Skeleton className="h-96" /></div>
  </div>;
}
