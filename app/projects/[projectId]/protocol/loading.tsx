import { Skeleton } from "@/components/ui/skeleton";

export default function ProtocolLoading() {
  return <div className="page-shell"><Skeleton className="h-4 w-28" /><div className="mt-8"><Skeleton className="h-8 w-64" /><Skeleton className="mt-3 h-4 w-[560px] max-w-full" /></div><div className="mt-10 grid gap-7 xl:grid-cols-[minmax(0,1fr)_320px]"><div className="space-y-6"><Skeleton className="h-36" /><Skeleton className="h-44" /><Skeleton className="h-80" /></div><Skeleton className="h-96" /></div></div>;
}
