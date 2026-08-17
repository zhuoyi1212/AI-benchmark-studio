import { Skeleton } from "@/components/ui/skeleton";

export default function ResearchLoading() {
  return <div className="page-shell"><Skeleton className="h-4 w-28" /><div className="mt-8"><Skeleton className="h-8 w-44" /><Skeleton className="mt-3 h-4 w-[520px] max-w-full" /></div><Skeleton className="mt-10 h-32 w-full" /><div className="mt-8 grid gap-4 xl:grid-cols-3"><Skeleton className="h-96" /><Skeleton className="h-96" /><Skeleton className="h-96" /></div></div>;
}
