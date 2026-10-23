import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { deriveWorkflowState } from '../lib/workflow-navigation-state.ts';
import { selectQuickWorkspaceJobs } from '../lib/quick/workspace-jobs.ts';

const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
const ui = new Proxy({}, { get: (_, key) => String(key) });
async function load(path, dependencies) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const fixtureModule = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    if (name in dependencies) return dependencies[name];
    if (name === 'react/jsx-runtime') return jsx;
    if (name === 'lucide-react' || name.startsWith('@/components/')) return ui;
    throw new Error(`Unexpected import: ${name}`);
  }, fixtureModule, fixtureModule.exports);
  return fixtureModule.exports;
}
function nodes(value) {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object') return [];
  return [value, ...nodes(value.props?.children)];
}
function state(complete = false, evaluationMode = 'quick') {
  return deriveWorkflowState({
    projectId: 'project', evaluationMode, productCount: 1,
    researchRuns: [{ id: 'research', status: 'completed', comparability: null }],
    protocols: [{ id: 'protocol', researchRunId: 'research', status: 'locked' }],
    testCases: [{ id: 'case', protocolId: 'protocol' }],
    testRuns: [{ id: 'run', protocolId: 'protocol', status: 'ready_for_review' }],
    artifactRunIds: ['run'],
    judgeRuns: complete ? [{ id: 'judge', protocolId: 'protocol', status: 'completed' }] : [],
    reviewSessions: complete ? [{ id: 'review', judgeRunId: 'judge', status: 'revealed' }] : [],
    experienceFindings: complete ? [{ id: 'finding', protocolId: 'protocol', status: 'completed', humanConfirmedAt: '2026-10-02' }] : [],
    resultAnalyses: [], reports: [], publishPacks: [],
  });
}
async function navigation(pathname, workflowState, activeStage) {
  const { WorkflowSteps } = await load('components/workflow-steps.tsx', {
    'next/navigation': { usePathname: () => pathname },
    '@/components/navigation-link': { NavigationLink: 'a' },
    '@/lib/utils': { cn: (...classes) => classes.filter(Boolean).join(' ') },
  });
  return nodes(WorkflowSteps({ projectId: 'project', workflowState, activeStage }));
}
const hrefs = tree => tree.filter(node => node.type === 'a').map(node => node.props.href);

test('quick workspace keeps earlier results navigable during analysis without unlocking unrevealed findings', async () => {
  const tree = await navigation('/projects/project/quick', state(), 'test');
  assert.deepEqual(hrefs(tree), ['/projects/project/research', '/projects/project/protocol', '/projects/project/test']);
  assert.equal(tree.filter(node => node.props?.['aria-disabled'] === 'true').length, 2);
  assert.equal(tree.find(node => node.props?.['aria-current'] === 'step').props.href, '/projects/project/test');
});

test('writing stage can revisit findings, protocol and research, with completion taken from persisted state', async () => {
  const tree = await navigation('/projects/project/quick', state(true), 'publish');
  assert.deepEqual(hrefs(tree), ['research', 'protocol', 'test', 'results', 'publish'].map(route => `/projects/project/${route}`));
  assert.equal(tree.find(node => node.props?.['aria-current'] === 'step').props.href, '/projects/project/publish');
});

test('community content page exposes all four earlier stages as clear, keyboard-accessible review links', async () => {
  const tree = await navigation('/projects/project/publish', state(true));
  const links = tree.filter(node => node.type === 'a');
  for (const [route, label] of [['research', '产品调研'], ['protocol', '测试计划'], ['test', '真实测试'], ['results', '测评发现']]) {
    const link = links.find(node => node.props.href === `/projects/project/${route}`);
    assert.ok(link, `${label} must remain reachable from the article`);
    assert.equal(link.props.title, `查看${label}`);
    assert.equal(link.props['aria-disabled'], undefined);
    assert.equal(link.props.onClick, undefined, 'reviewing a stage must only navigate, never regenerate');
    assert.match(link.props.className, /min-h-11/);
    assert.match(link.props.className, /cursor-pointer/);
    assert.match(link.props.className, /hover:bg-blue-50/);
    assert.match(link.props.className, /focus-visible:ring-2/);
  }
  assert.equal(links.find(node => node.props['aria-current'] === 'step').props.href, '/projects/project/publish');
});

test('browsing earlier stages keeps the article reachable and does not turn locked steps into links', async () => {
  for (const route of ['research', 'protocol', 'test', 'results']) {
    const tree = await navigation(`/projects/project/${route}`, state(true));
    assert.ok(hrefs(tree).includes('/projects/project/publish'));
    assert.equal(tree.find(node => node.props?.['aria-current'] === 'step').props.href, `/projects/project/${route}`);
  }
  const locked = await navigation('/projects/project/test', state());
  assert.ok(!hrefs(locked).includes('/projects/project/results'));
  for (const node of locked.filter(node => node.props?.['aria-disabled'] === 'true')) {
    assert.match(node.props.className, /cursor-not-allowed/);
    assert.doesNotMatch(node.props.className, /cursor-pointer|hover:bg-blue-50/);
  }
});

test('quick detail pages offer a return to the live workspace; professional pages do not', async () => {
  for (const route of ['research', 'protocol', 'test', 'results', 'publish']) {
    const tree = await navigation(`/projects/project/${route}`, state(true));
    assert.ok(hrefs(tree).includes('/projects/project/quick'));
    assert.equal(tree.find(node => node.props?.['aria-current'] === 'step').props.href, `/projects/project/${route}`);
  }
  assert.ok(!hrefs(await navigation('/projects/project/research', state(true, 'professional'))).includes('/projects/project/quick'));
});

test('running and failed quick pages retain navigation outside the hidden embedded workspace', async () => {
  for (const status of ['running', 'failed']) {
    const { default: Page } = await load('app/projects/[projectId]/quick/page.tsx', {
      '@/lib/supabase/read-scope': { withPageReads: page => page },
      'next/server': { connection: async () => {} },
      'next/headers': { headers: async () => new Headers({'x-ai-benchmark-access':'admin'}) },
      '@/lib/publish-presentation': { publishPresentation: value => value },
      'next/navigation': { notFound: () => { throw new Error('not found'); }, redirect: () => { throw new Error('redirect'); } },
      '@/lib/services/projects.service': { getProjectSummary: async () => ({ name: 'Project', evaluationMode: 'quick' }) },
      '@/lib/services/quick-workflow.service': { getQuickWorkflowJobs: async () => [{ id: 'job', kind: 'publish', status }] },
      '@/lib/services/protocols.service': { getProtocolWorkspace: async () => ({ protocol: { id: 'protocol', status: 'locked' } }) },
      '@/lib/services/workflow-navigation.service': { getProjectWorkflowState: async () => state(true) },
      '@/lib/services/findings.service': { getExperienceFindingsWorkspace: async () => null }, '@/lib/services/human-review.service': {}, '@/lib/services/publish.service': {},
      '@/lib/quick/workspace-jobs': { selectQuickWorkspaceJobs },
      '@/lib/quick/types': { quickStageLabels: { publish: '生成文章' } },
      './action-button': ui, '../results/findings-editor': ui, '../publish/publish-editor': ui,
      '../review/human-review-panel': ui, '../test/page': ui,
    });
    const tree = await Page({ params: Promise.resolve({ projectId: 'project' }) });
    const directChildren = tree.props.children.flat().filter(Boolean);
    assert.ok(directChildren.some(node => node.type === 'WorkflowSteps'));
    const embedded = directChildren.find(node => node.props?.className === 'quick-workspace');
    assert.ok(!nodes(embedded).some(node => node.type === 'WorkflowSteps'));
    assert.equal(directChildren.find(node => node.type === 'WorkflowSteps').props.activeStage, 'publish');
  }
});

test('legacy confirmed projects open their ready article before consulting missing Review records', async () => {
  const workflow=state(true);
  workflow.stages.review.completed=false;
  workflow.stages.publish.completed=true;
  const workspace={ projectId:'project',findingsId:'finding',pack:{id:'pack',status:'ready',post:{title:'Saved article'}} };
  const fail=()=>{throw new Error('Legacy ready article must not re-enter testing or Judge');};
  const {default:Page}=await load('app/projects/[projectId]/quick/page.tsx',{
    '@/lib/supabase/read-scope':{withPageReads:page=>page},
    'next/server':{connection:async()=>{}},'next/headers':{headers:async()=>new Headers({'x-ai-benchmark-access':'read-only'})},
    'next/navigation':{notFound:fail,redirect:fail},
    '@/lib/publish-presentation':{publishPresentation:value=>value},
    '@/lib/services/projects.service':{getProjectSummary:async()=>({name:'Legacy',evaluationMode:'quick'})},
    '@/lib/services/quick-workflow.service':{getQuickWorkflowJobs:async()=>[]},
    '@/lib/services/protocols.service':{getProtocolWorkspace:async()=>({protocol:{id:'protocol',status:'locked'}})},
    '@/lib/services/workflow-navigation.service':{getProjectWorkflowState:async()=>workflow},
    '@/lib/services/publish.service':{getPublishWorkspace:async()=>workspace},
    '@/lib/services/findings.service':{getExperienceFindingsWorkspace:fail},
    '@/lib/services/human-review.service':{getHumanReviewWorkspace:fail},
    '@/lib/quick/workspace-jobs':{selectQuickWorkspaceJobs},'@/lib/quick/types':{quickStageLabels:{}},
    './action-button':ui,'../results/findings-editor':ui,'../publish/publish-editor':ui,'../review/human-review-panel':ui,'../test/page':{default:fail},
  });
  const tree=nodes(await Page({params:Promise.resolve({projectId:'project'})}));
  assert.equal(tree.find(node=>node.type==='PublishEditor').props.workspace.pack.post.title,'Saved article');
});
