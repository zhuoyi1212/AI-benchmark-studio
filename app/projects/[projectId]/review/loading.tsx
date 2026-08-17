import { Skeleton } from "@/components/ui/skeleton";

export default function BlindReviewLoading() {
  return <div className="page-shell"><Skeleton className="h-4 w-28" /><div className="mt-8"><Skeleton className="h-8 w-48" /><Skeleton className="mt-3 h-4 w-[620px] max-w-full" /></div><Skeleton className="mt-10 h-24" /><div className="mt-8 grid gap-4 md:grid-cols-3"><Skeleton className="h-44" /><Skeleton className="h-44" /><Skeleton className="h-44" /></div></div>;
}
