import { withPageReads } from "@/lib/supabase/read-scope";
import { NavigationLink as Link } from "@/components/navigation-link";
import { connection } from 'next/server';
import { notFound, redirect } from 'next/navigation';
import { LoaderCircle } from 'lucide-react';
import { WorkflowSteps } from '@/components/workflow-steps';
import { getProjectSummary } from '@/lib/services/projects.service';
import { getProtocolWorkspace } from '@/lib/services/protocols.service';
import { getExperienceFindingsWorkspace } from '@/lib/services/findings.service';
import { getHumanReviewWorkspace } from '@/lib/services/human-review.service';
import { getPublishWorkspace } from '@/lib/services/publish.service';
import { getProjectWorkflowState } from '@/lib/services/workflow-navigation.service';
import { getQuickWorkflowJobs } from '@/lib/services/quick-workflow.service';
import { quickStageLabels } from '@/lib/quick/types';
import { selectQuickWorkspaceJobs } from '@/lib/quick/workspace-jobs';
import { AutoRefresh } from '@/components/auto-refresh';
import { Card } from '@/components/ui/card';
import { QuickActionButton } from './action-button';
import { FindingsEditor } from '../results/findings-editor';
import { PublishEditor } from '../publish/publish-editor';
import { HumanReviewPanel } from '../review/human-review-panel';
import TestPage from '../test/page';

export const maxDuration = 300;
async function QuickPage({ params }: { params: Promise<{ projectId: string }> }) {
  await connection();
  const { projectId } = await params;
  const [project, jobs] = await Promise.all([getProjectSummary(projectId), getQuickWorkflowJobs(projectId)]);
  if (!project) notFound();
  if (project.evaluationMode !== 'quick') redirect(`/projects/${projectId}/research`);
  const [protocolWorkspace, workflowState] = await Promise.all([getProtocolWorkspace(projectId), getProjectWorkflowState(projectId)]);
  const protocol = protocolWorkspace?.protocol;
  if (!workflowState) notFound();
  // Read current results before interpreting old queue failures. The publish service
  // binds its source to the current locked protocol and confirmed Findings.
  const preparedPublish = workflowState.stages.publish.completed ? await getPublishWorkspace(projectId) : null;
  const publishReady = preparedPublish?.pack?.status === 'ready';
  const needsReviewCheck = !publishReady && jobs.some(job => job.kind === 'evaluate' && job.scope === protocol?.id && job.status === 'failed');
  const needsFindingsCheck = !publishReady && jobs.some(job => ((job.kind === 'findings' && job.scope === protocol?.id) || ['discovery', 'publish'].includes(job.kind)) && job.status === 'failed');
  const [preparedReview, preparedFindings] = await Promise.all([
    needsReviewCheck ? getHumanReviewWorkspace(projectId) : null,
    needsFindingsCheck ? getExperienceFindingsWorkspace(projectId) : null,
  ]);
  const { active, failed } = selectQuickWorkspaceJobs(jobs, {
    protocolId: protocol?.id,
    protocolLocked: protocol?.status === 'locked',
    findingsId: preparedFindings?.latest?.id ?? preparedPublish?.findingsId ?? undefined,
    publishReady,
    reviewCompleted: preparedReview?.protocolId === protocol?.id && preparedReview?.status === 'revealed',
    findingsCompleted: preparedFindings?.protocolId === protocol?.id && preparedFindings?.latest?.status === 'completed',
  });
  let content: React.ReactNode;
  let step = 0;
  if (active || failed) {
    const job = active ?? failed!;
    step = ['research','protocol'].includes(job.kind) ? 0 : ['evaluate','findings'].includes(job.kind) ? 2 : 4;
    content = <Card className="p-8 shadow-none"><div className="flex items-center gap-3">{active && <LoaderCircle className="h-5 w-5 animate-spin text-blue-600" />}<h2 className="text-lg font-semibold">{quickStageLabels[job.stage ?? ''] ?? quickStageLabels[job.kind]}</h2></div>
      <p className="mt-3 text-sm text-muted-foreground">{active ? '后台正在处理，可以离开此页。' : job.error_message}</p>
      {failed && !active && <div className="mt-5"><QuickActionButton projectId={projectId} operation="retry" id={job.id}>重试当前阶段</QuickActionButton></div>}
    </Card>;
  } else if (!protocol) {
    content = <QuickActionButton projectId={projectId} operation="prepare">继续自动准备</QuickActionButton>;
  } else if (protocol.status === 'draft') {
    content = <Card className="p-6 shadow-none"><h2 className="text-xl font-semibold">{protocol.testCases[0]?.title}</h2><p className="mt-3 text-sm text-muted-foreground">{protocol.goal}</p>
      <div className="my-5 whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-7">{protocol.testCases[0]?.prompt}</div>
      <details className="mb-5 text-sm"><summary className="cursor-pointer text-muted-foreground">查看完整方案</summary><div className="mt-3 space-y-2">{protocol.rubric.map(item => <p key={item.id}>{item.name} · {item.weight}%</p>)}<Link className="text-blue-700" href={`/projects/${projectId}/protocol`}>调整测试方案</Link></div></details>
      <p className="mb-3 text-xs text-muted-foreground">采用后锁定本次方案；调整需创建新版本。</p>
      <QuickActionButton projectId={projectId} operation="adopt" id={protocol.id}>采用方案，开始测试</QuickActionButton>
    </Card>;
  } else if (!workflowState.stages.review.completed) {
    const evaluation = jobs.find(job => job.kind === 'evaluate' && job.scope === protocol.id && job.status === 'completed');
    if (evaluation) {
      const review = await getHumanReviewWorkspace(projectId);
      content = review ? <HumanReviewPanel workspace={review} workflowState={workflowState} /> : <p>复核记录暂不可用，请刷新。</p>;
      step = 2;
    } else {
      content = await TestPage({ params: Promise.resolve({ projectId }) });
      step = 1;
    }
  } else {
    const findings = preparedFindings ?? await getExperienceFindingsWorkspace(projectId);
    const run = findings?.latest;
    if (run?.humanConfirmedAt) {
      const publish = preparedPublish ?? await getPublishWorkspace(projectId);
      content = !jobs.some(job => job.kind === 'discovery') && publish?.pack?.status !== 'ready'
        ? <QuickActionButton projectId={projectId} operation="write" id={run.id}>生成文章</QuickActionButton>
        : publish ? <PublishEditor quick key={`${publish.pack?.id}-${publish.pack?.status}`} workspace={publish} workflowState={workflowState} /> : <p>正在准备文章。</p>;
      step = 4;
    } else if (run?.effectiveOutput) {
      content = <FindingsEditor projectId={projectId} findingsId={run.id} initial={run.effectiveOutput} quick />;
      step = 3;
    } else {
      content = <QuickActionButton projectId={projectId} operation="evaluate" id={protocol.id}>继续自动分析</QuickActionButton>;
      step = 2;
    }
  }
  return <div className="page-shell max-w-5xl">
    {active && <AutoRefresh intervalMs={3000} />}
    <div className="mb-7 flex items-center justify-between"><div><p className="text-xs text-blue-600">快速模式</p><h1 className="mt-2 text-2xl font-semibold">{step === 2 ? '测评工作台' : project.name}</h1></div><Link href="/projects" className="text-xs text-muted-foreground">全部项目</Link></div>
    <WorkflowSteps projectId={projectId} workflowState={workflowState} activeStage={(['protocol', 'test', 'test', 'results', 'publish'] as const)[step]} />
    <div className="quick-workspace">{content}</div>
    {step === 4 && !active && jobs.filter(job => ['analysis','report'].includes(job.kind) && job.status === 'failed').map(job => <div key={job.id} className="mt-5 rounded-lg border p-4 text-sm"><p className="mb-3">专业报告暂未完成，文章可正常使用。</p><QuickActionButton projectId={projectId} operation="retry" id={job.id}>重试专业报告</QuickActionButton></div>)}
    <style>{'.quick-workspace .page-shell{padding:0;max-width:none}.quick-workspace nav[aria-label="测评工作流"]{display:none}'}</style>
  </div>;
}

export default withPageReads(QuickPage);
