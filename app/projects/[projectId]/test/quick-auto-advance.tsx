"use client";
import { QuickActionButton } from "@/app/projects/[projectId]/quick/action-button";

// Upload completion enqueues on the server. This is an explicit recovery control for legacy uploads.
export function QuickAutoAdvance({ projectId, protocolId }: { projectId: string; protocolId: string; countdown?: boolean }) {
  return <QuickActionButton projectId={projectId} operation="evaluate" id={protocolId}>继续自动分析</QuickActionButton>;
}
