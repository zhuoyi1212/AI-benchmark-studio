"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";
import { LoaderCircle } from "lucide-react";

export function NavigationLink({ children, ...props }: ComponentProps<typeof Link>) {
  return <Link {...props}>{children}<PendingIndicator /></Link>;
}

function PendingIndicator() {
  const { pending } = useLinkStatus();
  return pending ? <span role="status" aria-label="正在打开页面" className="inline-flex shrink-0"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /></span> : null;
}
