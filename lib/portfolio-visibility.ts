// Portfolio display only: these projects were operated by an AI agent as
// showcase samples, and their locked deep reports still contain execution-log
// wording. Reports are immutable, so visitors are kept away from them instead
// of rewriting history. Administrators keep full access. Remove an id to show
// its report again.
const visitorHiddenReportProjectIds = new Set([
  "77ac52ae-cb4c-477b-9783-688dead41c12", // 即梦AI｜中文咖啡活动海报生成
  "85cc4ea9-9902-4e10-aacc-e2320cbac926", // 腾讯元宝｜联网查证与来源核验
]);

export function isReportHiddenFromVisitors(projectId: string, access: string | null): boolean {
  return access !== "admin" && visitorHiddenReportProjectIds.has(projectId);
}
