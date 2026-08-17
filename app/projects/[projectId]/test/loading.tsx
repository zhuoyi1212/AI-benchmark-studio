import { Skeleton } from "@/components/ui/skeleton";

export default function TestExecutionLoading() {
  return <div className="page-shell"><Skeleton className="h-4 w-28" /><div className="mt-8"><Skeleton className="h-8 w-36" /><Skeleton className="mt-3 h-4 w-[560px] max-w-full" /></div><Skeleton className="mt-10 h-28" /><div className="mt-8 space-y-6"><Skeleton className="h-56" /><Skeleton className="h-56" /></div></div>;
}
