// Portfolio visitors see the same evidence → findings → article workflow.
// Original scoring and reports remain available to administrators as history.
export function isReportHiddenFromVisitors(access: string | null): boolean {
  return access !== "admin";
}
