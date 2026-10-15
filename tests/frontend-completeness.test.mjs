import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fileURLToPath } from 'node:url';
import createLoader from '../scripts/lib/load-typescript.cjs';
import { selectQuickWorkspaceJobs } from '../lib/quick/workspace-jobs.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const action = async () => ({ message: null });
const link = ({ children, ...props }) => React.createElement('a', props, children);
const common = {
  'next/link': link,
  '@/components/navigation-link': { NavigationLink: link },
  '@/components/workflow-steps': { WorkflowSteps: () => null },
  '@/lib/supabase/read-scope': { withPageReads: page => page },
};
const job = (id, kind, status, scope = 'protocol', created_at = '2026-10-14T10:00:00Z', payload = {}) => ({ id, kind, status, scope, created_at, payload });
const progress = { protocolId: 'protocol', protocolLocked: true, reviewCompleted: false, findingsCompleted: false, publishReady: false };

test('current saved article resolves stale evaluation and writing failures without rewriting audit jobs', () => {
  const jobs = [job('old-judge', 'evaluate', 'failed'), job('old-post', 'publish', 'failed'), job('good-post', 'publish', 'completed')];
  const before = structuredClone(jobs);
  assert.deepEqual(selectQuickWorkspaceJobs(jobs, { ...progress, publishReady: true }), { active: undefined, failed: undefined });
  assert.deepEqual(jobs, before);
});

test('current failures and live new work remain visible even when an earlier delivery succeeded', () => {
  const prior = job('prior', 'publish', 'completed', 'same', '2026-10-14T09:00:00Z');
  const failed = job('new', 'publish', 'failed', 'same');
  assert.equal(selectQuickWorkspaceJobs([prior, failed], progress).failed.id, 'new');
  const running = job('running', 'publish', 'running');
  assert.equal(selectQuickWorkspaceJobs([running], { ...progress, publishReady: true }).active.id, 'running');
});

test('completed current review and Findings resolve their earlier failures independently of publication', () => {
  const jobs = [job('judge', 'evaluate', 'failed'), job('findings', 'findings', 'failed')];
  assert.equal(selectQuickWorkspaceJobs(jobs, { ...progress, reviewCompleted: true }).failed.id, 'findings');
  assert.equal(selectQuickWorkspaceJobs(jobs, { ...progress, findingsCompleted: true }).failed.id, 'judge');
  assert.equal(selectQuickWorkspaceJobs(jobs, { ...progress, reviewCompleted: true, findingsCompleted: true }).failed, undefined);
});

test('work from older protocols and Findings cannot block a new protocol', () => {
  const jobs = [job('judge', 'evaluate', 'failed', 'old-protocol'), job('post', 'publish', 'failed', 'old-writing', undefined, { findingsId: 'old-findings' })];
  assert.equal(selectQuickWorkspaceJobs(jobs, { ...progress, findingsId: 'current-findings' }).failed, undefined);
  assert.equal(selectQuickWorkspaceJobs(jobs, { ...progress, protocolLocked: false }).failed, undefined);
});

test('only a later completion in the same job input scope supersedes a failure', () => {
  const failed = job('failed', 'publish', 'failed', 'input-a');
  assert.equal(selectQuickWorkspaceJobs([failed, job('other', 'publish', 'completed', 'input-b', '2026-10-14T11:00:00Z')], progress).failed.id, 'failed');
  assert.equal(selectQuickWorkspaceJobs([failed, job('new', 'publish', 'completed', 'input-a', '2026-10-14T11:00:00Z')], progress).failed, undefined);
});

test('optional report failures and explicit regeneration never replace the main workspace', () => {
  const jobs = [job('analysis', 'analysis', 'failed'), job('report', 'report', 'failed'), job('regenerate', 'publish', 'running', 'revision', undefined, { mode: 'regenerate' })];
  assert.deepEqual(selectQuickWorkspaceJobs(jobs, progress), { active: undefined, failed: undefined });
});

const dimension = { id: 'dimension', name: '引用准确性', weight: 100, description: '逐条核对引用与结论', scoringStandard: { excellent: '优秀档的真实规则', good: '良好档的真实规则', acceptable: '合格档的真实规则', poor: '较差档的真实规则' } };
const protocol = { id: 'protocol', projectId: 'project', status: 'locked', version: 1, title: '任务方案', goal: '核对官方信息', rules: [], testCases: [], rubric: [dimension] };

test('Rubric displays the selected dimension description and every saved scoring band', () => {
  const load = createLoader(root, { ...common, '@/app/projects/[projectId]/protocol/protocol-actions': { GenerateProtocolAction: () => null, LockProtocolAction: () => null, RemoveTestCaseAction: () => null } });
  const { ProtocolView } = load('@/app/projects/[projectId]/protocol/protocol-view');
  const html = renderToStaticMarkup(React.createElement(ProtocolView, { protocol, productCount: 1, evaluationMode: 'quick', canRegenerate: false, inputConstraints: null }));
  for (const text of [dimension.description, ...Object.values(dimension.scoringStandard)]) assert.ok(html.includes(text), text);
  const legacy = structuredClone(protocol); legacy.rubric[0].scoringStandard = { excellent: '旧版记录' };
  const old = renderToStaticMarkup(React.createElement(ProtocolView, { protocol: legacy, productCount: 1, evaluationMode: 'quick', canRegenerate: false, inputConstraints: null }));
  assert.equal((old.match(/当前版本未记录此档标准/g) ?? []).length, 3);
});

function reviewFixture(status = 'revealed') {
  return { projectId: 'project', protocolId: 'protocol', protocolVersion: 1, reviewSessionId: 'review', evaluationMode: 'quick', status,
    rubric: [dimension], samples: [{ sampleId: 'sample', label: 'Sample A' }], testCases: [{ id: 'case', title: '引用核验', position: 1 }],
    summary: { total: 1, adjusted: 1, accepted: 0, auditEvents: 3, anomalies: 0 },
    scores: [{ judgeScoreId: 'score', testCaseId: 'case', blindSampleId: 'sample', rubricDimensionId: 'dimension', aiScore: 8, finalScore: 7, reason: '原始AI理由保持不变', evidence: ['实际原始证据片段'], confidence: .9, humanOverride: { score: 7, reason: '本次有效修正的理由' }, revisionCount: 3, reviewFlags: [] }],
    auditHistory: [{ id: 'a', judgeScoreId: 'score', action: 'override', score: 6, reason: '第一次修正理由', createdAt: '2026-10-14T01:00:00Z' }, { id: 'b', judgeScoreId: 'score', action: 'revert', score: null, reason: null, createdAt: '2026-10-14T02:00:00Z' }, { id: 'c', judgeScoreId: 'score', action: 'override', score: 7, reason: '本次有效修正的理由', createdAt: '2026-10-14T03:00:00Z' }],
    revealedMappings: status === 'revealed' ? [{ sampleId: 'sample', productName: '已揭晓产品' }] : null };
}
function reviewLoad() {
  return createLoader(root, { ...common, '@/app/projects/[projectId]/review/human-review-actions': { lockHumanReviewAction: action, completeQuickReviewAction: action, revealHumanReviewAction: action, revertHumanOverrideAction: action, saveHumanOverrideAction: action } });
}

test('locked and revealed reviews retain every score, evidence and correction but render no edit controls', () => {
  const { HumanReviewPanel } = reviewLoad()('@/app/projects/[projectId]/review/human-review-panel');
  for (const status of ['locked', 'revealed']) {
    const workspace = reviewFixture(status), before = structuredClone(workspace);
    const html = renderToStaticMarkup(React.createElement(HumanReviewPanel, { workspace, workflowState: { stages: {} } }));
    for (const text of ['引用准确性', '原始AI理由保持不变', '实际原始证据片段', '本次有效修正的理由', '第一次修正理由', '90%', '评分与复核明细']) assert.ok(html.includes(text), text);
    assert.match(html, /8\.0/); assert.match(html, /7\.0/);
    assert.doesNotMatch(html, />修改评分</); assert.doesNotMatch(html, /name="score"/); assert.doesNotMatch(html, />恢复 AI 评分<\/button>/);
    assert.equal(html.includes('已揭晓产品'), status === 'revealed');
    assert.deepEqual(workspace, before);
  }
});

test('a zero-adjustment historical review remains readable without audit-history fields', () => {
  const { HumanReviewPanel } = reviewLoad()('@/app/projects/[projectId]/review/human-review-panel');
  const workspace = reviewFixture(); delete workspace.auditHistory; workspace.scores[0].humanOverride = null;
  const html = renderToStaticMarkup(React.createElement(HumanReviewPanel, { workspace, workflowState: { stages: {} } }));
  assert.ok(html.includes('原始AI理由保持不变')); assert.doesNotMatch(html, /修改记录/);
});

test('completed product research renders saved limitations and official practices, including historical empties', async () => {
  const product = { productId: 'product', name: '研究产品', initials: '研', positioning: '完整产品定位', capabilities: [], targetUsers: [], keyFeatures: [], inputFormats: [], outputFormats: [], sources: [], limitations: ['输入最长1000字', '未核验导出权限'], officialBestPractices: ['先说明目标读者', '明确所需输出格式'] };
  const load = createLoader(root, { ...common, 'next/server': { connection: async () => {} }, 'next/navigation': { notFound: () => { throw Error('not found'); } },
    '@/lib/services/research.service': { getResearchWorkspace: async () => ({ project: { id: 'project', name: '研究项目', products: [product] }, completedResult: { version: 1, generatedAt: '2026-10-14T00:00:00Z', products: [product], comparability: { status: 'comparable', reason: '可以测试', commonCapabilities: [], warnings: [] } }, latestRun: { status: 'completed' } }) },
    '@/lib/services/workflow-navigation.service': { getProjectWorkflowState: async () => ({ stages: Object.fromEntries(['research', 'protocol', 'test', 'review', 'results', 'report', 'publish'].map(stage => [stage, { completed: true, accessible: true, lockedReason: null }])) }) },
    '@/app/projects/[projectId]/research/research-action': { ResearchAction: () => null },
  });
  const html = renderToStaticMarkup(await load('@/app/projects/[projectId]/research/page').default({ params: Promise.resolve({ projectId: 'project' }) }));
  for (const text of [...product.limitations, ...product.officialBestPractices, product.positioning]) assert.ok(html.includes(text), text);
  product.limitations = undefined; product.officialBestPractices = undefined;
  const old = renderToStaticMarkup(await load('@/app/projects/[projectId]/research/page').default({ params: Promise.resolve({ projectId: 'project' }) }));
  assert.equal((old.match(/当前调研未记录此项/g) ?? []).length, 2);
});


test('review service projects complete append-only history without actor identity and reveals mapping only after reveal', async () => {
  for (const status of ['locked', 'revealed']) {
    const workspace = reviewFixture(status);
    const events = workspace.auditHistory.map((event, index) => ({ id: event.id, judge_score_id: event.judgeScoreId, action: event.action, override_score: event.score, reason: event.reason, created_at: event.createdAt, actor_id: 'private-actor', event_sequence: index + 1 }));
    let mappingReads = 0;
    const load = createLoader(root, {
      '@/lib/supabase/read-scope': { memoPageRead: (_key, execute) => execute() },
      '@/lib/services/judge.service': { getJudgeReviewWorkspace: async () => ({ projectId: 'project', protocolId: 'protocol', latestRun: { id: 'judge', status: 'completed', scores: [{ id: 'score', testCaseId: 'case', blindSampleId: 'sample', rubricDimensionId: 'dimension', aiScore: 8, reason: '原始理由', evidence: ['证据'], confidence: .9 }] } }) },
      '@/lib/repositories/human-review.repository': { humanReviewRepository: {
        findByJudgeRun: async () => ({ id: 'review' }), getSession: async () => ({ id: 'review', project_id: 'project', protocol_id: 'protocol', judge_run_id: 'judge', status }),
        listEvents: async () => events,
        listFinalScores: async () => [{ judge_score_id: 'score', final_score: 7, active_override_event_id: 'c' }],
        getRevealedMappings: async () => { mappingReads++; return []; },
      } },
    });
    const result = await load('@/lib/services/human-review.service').getHumanReviewWorkspace('project');
    assert.deepEqual(result.auditHistory.map(e => e.action), ['override', 'revert', 'override']);
    assert.equal(result.scores[0].aiScore, 8); assert.equal(result.scores[0].finalScore, 7); assert.equal(result.scores[0].reason, '原始理由');
    assert.equal(JSON.stringify(result).includes('private-actor'), false);
    assert.equal(mappingReads, status === 'revealed' ? 1 : 0);
  }
});
