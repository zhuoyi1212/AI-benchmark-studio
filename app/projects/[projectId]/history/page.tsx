import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { withPageReads } from "@/lib/supabase/read-scope";
import { findingsRepository } from "@/lib/repositories/findings.repository";
import { publishRepository } from "@/lib/repositories/publish.repository";
import { getProjectWorkflowState } from "@/lib/services/workflow-navigation.service";
import { getExperienceFindingsWorkspace } from "@/lib/services/findings.service";
import { confirmedFindingsOutputSchema } from "@/lib/ai/schemas/findings.schemas";
import { communityPostOutputSchema } from "@/lib/ai/schemas/publish.schemas";
import { WorkflowSteps } from "@/components/workflow-steps";

async function HistoryPage({ params }: { params: Promise<{ projectId: string }> }) {
  await connection();
  const { projectId } = await params;
  if ((await headers()).get("x-ai-benchmark-access") !== "admin") redirect(`/projects/${projectId}/publish`);
  const [workspace, workflow] = await Promise.all([getExperienceFindingsWorkspace(projectId), getProjectWorkflowState(projectId)]);
  if (!workspace?.latest?.humanConfirmedAt || !workflow) redirect(`/projects/${projectId}/results`);
  const findings = await findingsRepository.list(projectId);
  const confirmed = findings.filter(row => row.human_confirmed_at);
  const histories = await Promise.all(confirmed.map(async row => ({
    finding: row,
    revisions: await findingsRepository.listRevisions(row.id),
    packs: await publishRepository.listByFindings(row.id),
  })));
  const packs = histories.flatMap(item => item.packs).sort((a, b) => b.created_at.localeCompare(a.created_at));
  return <div className="page-shell max-w-5xl">
    <WorkflowSteps projectId={projectId} workflowState={workflow} activeStage="publish" />
    <Link href={`/projects/${projectId}/publish`} className="text-xs text-blue-600">返回当前文章</Link>
    <h1 className="mt-5 text-2xl font-semibold">版本记录</h1>
    <p className="mt-3 text-sm text-muted-foreground">每次修订另存一版。原始测试、AI 原分和旧文章完整保留。</p>
    <section className="mt-9"><h2 className="mb-4 text-sm font-semibold">文章 · {packs.length} 个版本</h2><div className="space-y-3">
      {packs.map(pack => {
        const parsed = communityPostOutputSchema.safeParse({ ...(pack.community_post as object ?? {}), screenshotRecommendations: [] });
        const post = parsed.success ? parsed.data : null;
        return <details key={pack.id} className="rounded-xl border bg-white p-5"><summary className="cursor-pointer text-sm font-medium">v{pack.version} · {post?.title ?? "未完成的生成"}<span className="ml-3 text-xs font-normal text-muted-foreground">{post?.manualEdit ? "编辑稿 · 未重新 AI 审核" : pack.status === "ready" ? "生成稿" : "未完成"}</span></summary>
          <p className="mt-4 text-xs text-muted-foreground">{date(pack.created_at)}{post?.manualEdit?.reason ? ` · ${post.manualEdit.reason}` : ""}</p>
          {post && <div className="mt-5 whitespace-pre-wrap text-sm leading-8 text-slate-700">{post.body}</div>}
        </details>;
      })}
    </div></section>
    <section className="mt-9"><h2 className="mb-4 text-sm font-semibold">测评发现</h2><div className="space-y-3">
      {histories.flatMap(({ finding, revisions }) => [
        ...revisions.map(revision => ({ key: revision.id, label: revision.kind === "recovered" ? "从清理前备份恢复的确认文本" : `展示修订 ${revision.version}`, output: revision.output, reason: revision.reason, createdAt: revision.created_at })),
        { key: finding.id, label: `原确认记录 v${finding.version}`, output: finding.human_output ?? finding.output, reason: "保留当时的确认文本与原始 AI 输出。", createdAt: finding.human_confirmed_at },
        { key: `${finding.id}-ai`, label: `原始 AI 发现 v${finding.version}`, output: finding.output, reason: "原始模型输出，未被展示修订覆盖。", createdAt: finding.completed_at },
      ]).map(item => {
        const parsed = confirmedFindingsOutputSchema.safeParse(item.output);
        return <details key={item.key} className="rounded-xl border bg-white p-5"><summary className="cursor-pointer text-sm font-medium">{item.label}</summary><p className="mt-4 text-xs text-muted-foreground">{date(item.createdAt)} · {item.reason}</p>{parsed.success && <div className="mt-4 space-y-4 text-sm leading-7"><p>{parsed.data.summary}</p>{parsed.data.findings.map(finding => <div key={finding.id}><strong>{finding.title}</strong><p>{finding.observation}</p></div>)}<ul>{parsed.data.limitations.map(limit => <li key={limit}>· {limit}</li>)}</ul></div>}</details>;
      })}
    </div></section>
    {workflow.stages.review.completed && <details className="mt-9 rounded-xl border border-dashed p-5"><summary className="cursor-pointer text-sm">历史评分与报告</summary><p className="mt-4 text-xs leading-6 text-muted-foreground">按当时锁定的标准保留，展示修订不会改分，也不代表重新评测。</p><div className="mt-3 flex gap-5 text-sm text-blue-600"><Link href={`/projects/${projectId}/review`}>原始评分与复核</Link><Link href={`/projects/${projectId}/report`}>专业报告</Link></div></details>}
  </div>;
}

function date(value: string | null) { return value ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : ""; }
export default withPageReads(HistoryPage);
