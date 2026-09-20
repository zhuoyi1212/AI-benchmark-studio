import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, ArrowRight, Check, ExternalLink, FileText, FlaskConical, ShieldCheck, Sparkles } from "lucide-react";
import { FindingsEditor } from "@/app/projects/[projectId]/results/findings-editor";
import { FindingsGenerationAction } from "@/app/projects/[projectId]/results/findings-generation-action";
import { ProfessionalReviewAction } from "@/app/projects/[projectId]/test/test-actions";
import { ResultAnalysisAction } from "@/app/projects/[projectId]/results/result-analysis-action";
import { PageHeader } from "@/components/page-header";
import { WorkflowSteps } from "@/components/workflow-steps";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ExperienceFindingItem } from "@/lib/ai/schemas/findings.schemas";
import { getExperienceFindingsWorkspace, type ExperienceFindingsWorkspace } from "@/lib/services/findings.service";
import { getResultsWorkspace } from "@/lib/services/result-analysis.service";
import { getProjectWorkflowState } from "@/lib/services/workflow-navigation.service";

export const maxDuration = 300;

const categoryMeta = {
  good: { label: "好用", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  neutral: { label: "体验一般", className: "border-slate-200 bg-slate-50 text-slate-700" },
  problem: { label: "问题 / 难用", className: "border-red-200 bg-red-50 text-red-700" },
} as const;

export default async function ResultsPage({ params }: { params: Promise<{ projectId: string }> }) {
  await connection();
  const { projectId } = await params;
  const [workspace, workflowState, professional] = await Promise.all([
    getExperienceFindingsWorkspace(projectId),
    getProjectWorkflowState(projectId),
    getResultsWorkspace(projectId),
  ]);
  if (!workspace) redirect(`/projects/${projectId}/test`);
  if (!workflowState) redirect("/projects");

  const run = workspace.latest;
  const ready = run?.status === "completed" && run.effectiveOutput;
  const confirmed = Boolean(ready && run.humanConfirmedAt);

  return <div className="page-shell">
    <WorkflowSteps projectId={projectId} workflowState={workflowState} />
    <Link href={`/projects/${projectId}/test`} className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-3.5 w-3.5" />返回真实测试
    </Link>
    <PageHeader
      eyebrow={`Findings / Test Plan v${workspace.protocolVersion}`}
      title="测评发现"
      description="直接从真实 TestRun 和原始 Artifact 提炼值得写进内容的发现。这里不需要先跑 AI Judge，也不要求先生成综合评分。"
      action={confirmed
        ? <Badge variant="success"><Check className="h-3 w-3" />已人工确认 · 可直接生成内容</Badge>
        : <Badge variant="neutral"><Sparkles className="h-3 w-3" />快速测评模式</Badge>}
    />

    {!run || run.status !== "completed" ? <GenerationState workspace={workspace} /> : !run.humanConfirmedAt && run.effectiveOutput
      ? <FindingsEditor projectId={projectId} findingsId={run.id} initial={run.effectiveOutput} />
      : run.effectiveOutput ? <ConfirmedFindings workspace={workspace} /> : null}

    <ProfessionalMode projectId={projectId} protocolId={workspace.protocolId} professional={professional} />
  </div>;
}

function GenerationState({ workspace }: { workspace: ExperienceFindingsWorkspace }) {
  const run = workspace.latest;
  const failed = run?.status === "failed";
  const running = run?.status === "pending" || run?.status === "running";
  return <Card className="mx-auto max-w-2xl p-8 text-center shadow-none">
    <FlaskConical className="mx-auto h-7 w-7 text-blue-600" />
    <h2 className="mt-4 text-xl font-semibold">{failed ? "上次 Findings 提炼失败" : running ? "正在读取真实测试证据" : "从测试证据里提炼真正值得讲的东西"}</h2>
    <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
      AI 会直接读取你上传的文本、截图、PDF 或视频 Artifact，按“好用 / 一般 / 问题”提炼具体观察，不先打分，也不从分数倒推结论。
    </p>
    <div className="mt-6">
      {running ? <div className="text-sm text-blue-700">Findings 正在生成，刷新后查看结果。</div>
        : <FindingsGenerationAction projectId={workspace.projectId} retry={failed} />}
    </div>
    {failed && run?.errorMessage && <p className="mt-3 text-xs text-red-600">{run.errorMessage}</p>}
  </Card>;
}

function ConfirmedFindings({ workspace }: { workspace: ExperienceFindingsWorkspace }) {
  const output = workspace.latest!.effectiveOutput!;
  const artifactById = new Map(workspace.artifacts.map((item) => [item.artifactId, item]));
  const groups = (["good", "neutral", "problem"] as const).map((category) => ({
    category,
    items: output.findings.filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0);

  return <>
    <Card className="border-blue-200 p-6 shadow-none">
      <div className="eyebrow text-blue-600">这次测试最值得说的结论</div>
      <p className="mt-3 text-base font-medium leading-8 text-slate-800">{output.summary}</p>
    </Card>

    <div className="mt-6 space-y-8">
      {groups.map((group) => <section key={group.category}>
        <div className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${categoryMeta[group.category].className}`}>
          {categoryMeta[group.category].label}
        </div>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          {group.items.map((finding) => <FindingCard key={finding.id} finding={finding} artifactById={artifactById} />)}
        </div>
      </section>)}
    </div>

    <Card className="mt-8 p-5 shadow-none">
      <div className="eyebrow">测试限制</div>
      <ul className="mt-3 space-y-2">{output.limitations.map((item) => <li key={item} className="text-xs leading-6 text-muted-foreground">· {item}</li>)}</ul>
    </Card>

    <section className="mt-8 flex flex-col items-center rounded-xl border bg-slate-950 px-6 py-8 text-center text-white">
      <Sparkles className="h-5 w-5 text-blue-300" />
      <h2 className="mt-3 text-xl font-semibold">直接把这些 Findings 变成社区内容</h2>
      <p className="mt-2 max-w-xl text-xs leading-6 text-slate-400">下一步只做内容策划、语言风格生成和事实核对，不要求先生成评分或深度报告。</p>
      <Button className="mt-5 bg-white text-slate-950 hover:bg-slate-100" asChild>
        <Link href={`/projects/${workspace.projectId}/publish`}>生成社区内容<ArrowRight className="h-4 w-4" /></Link>
      </Button>
    </section>
  </>;
}

function FindingCard({
  finding,
  artifactById,
}: {
  finding: ExperienceFindingItem;
  artifactById: Map<string, ExperienceFindingsWorkspace["artifacts"][number]>;
}) {
  const artifacts = finding.evidenceArtifactIds.map((id) => artifactById.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
  return <Card className="p-5 shadow-none">
    <h3 className="text-base font-semibold">{finding.title}</h3>
    <div className="mt-4">
      <div className="eyebrow">实际观察</div>
      <p className="mt-2 text-sm leading-7 text-slate-700">{finding.observation}</p>
    </div>
    <div className="mt-4">
      <div className="eyebrow">对使用者的影响</div>
      <p className="mt-2 text-sm leading-7 text-slate-600">{finding.impact}</p>
    </div>
    <div className="mt-4 border-t pt-3">
      <div className="eyebrow">真实证据</div>
      <div className="mt-2 space-y-2">{artifacts.map((artifact) => <a key={artifact.artifactId} href={artifact.fileUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-xs hover:bg-slate-100">
        <span className="min-w-0 truncate">{artifact.testCaseTitle} · {artifact.fileName}</span>
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </a>)}</div>
    </div>
  </Card>;
}

function ProfessionalMode({ projectId, protocolId, professional }: { projectId: string; protocolId: string; professional: Awaited<ReturnType<typeof getResultsWorkspace>> }) {
  const analysis = professional?.latestAnalysis;
  const complete = analysis?.status === "completed" && !analysis.stale && analysis.output;
  return <section className="mt-10 rounded-lg border border-dashed bg-slate-50/50 p-5">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-slate-500" />专业测评模式（可选）</div>
        <p className="mt-1.5 max-w-2xl text-xs leading-5 text-muted-foreground">需要结构化评分、Blind Judge、人工复核或深度报告时再进入。它不会阻塞 Findings 和社区内容。</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {!professional && <ProfessionalReviewAction projectId={projectId} protocolId={protocolId} label="进入专业评分" />}
        {professional && !complete && <ResultAnalysisAction projectId={projectId} retry={Boolean(analysis?.stale || analysis?.status === "failed")} />}
        {complete && <Button variant="outline" asChild><Link href={`/projects/${projectId}/report`}><FileText className="h-4 w-4" />生成深度报告</Link></Button>}
      </div>
    </div>
  </section>;
}
