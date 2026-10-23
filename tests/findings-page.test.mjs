import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../app/projects/[projectId]/results/page.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const workspace = { projectId: 'project', protocolId: 'protocol', protocolVersion: 1, latest: null };
const ui = new Proxy({}, { get: (_target, name) => String(name) });

function loadPage({ findings = workspace, revealed = false, professional = async () => null, workflow = true, confirmed = false } = {}) {
  let professionalReads = 0;
  const dependencies = {
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'next/link': { default: 'Link' },
    'next/navigation': { redirect: path => { throw new Error(`redirect:${path}`); } },
    'next/server': { connection: async () => {} },
    'lucide-react': ui,
    '@/lib/supabase/read-scope': { withPageReads: render => render },
    '@/lib/services/findings.service': { getExperienceFindingsWorkspace: async () => findings },
    '@/lib/services/workflow-navigation.service': { getProjectWorkflowState: async () => workflow ? { stages: { review: { completed: revealed }, results: { completed: confirmed } } } : null },
    '@/lib/services/result-analysis.service': { getResultsWorkspace: async () => { professionalReads++; return professional(); } },
    'next/headers': { headers: async () => new Headers({ 'x-ai-benchmark-access': 'admin' }) },
    '@/lib/portfolio-visibility': { isReportHiddenFromVisitors: () => false },
  };
  const fixtureModule = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    if (name in dependencies) return dependencies[name];
    if (name.startsWith('@/components/') || name.startsWith('@/app/')) return ui;
    throw new Error(`Unexpected dependency: ${name}`);
  }, fixtureModule, fixtureModule.exports);
  return { render: () => fixtureModule.exports.default({ params: Promise.resolve({ projectId: 'project' }) }), reads: () => professionalReads };
}

function nodes(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (typeof value !== 'object') return [value];
  if (typeof value.type === 'function') return nodes(value.type(value.props));
  return [value, ...nodes(value.props?.children)];
}

test('Quick Findings redirects to Review until Blind identity reveal is complete', async () => {
  const page = loadPage({ professional: async () => { throw new Error('Blind Samples 尚未建立。'); } });
  await assert.rejects(page.render(), /redirect:\/projects\/project\/review/);
  assert.equal(page.reads(), 0);
});

test('professional results are loaded after reveal and preserve existing analysis action', async () => {
  const page = loadPage({ revealed: true, professional: async () => ({ latestAnalysis: null }) });
  const content = nodes(await page.render());
  assert.equal(page.reads(), 1);
  assert.ok(content.some(node => node.type === 'ResultAnalysisAction'));
});

test('failure in optional professional results is visible without blocking Quick Findings', async () => {
  const page = loadPage({ revealed: true, professional: async () => { throw new Error('professional unavailable'); } });
  const content = nodes(await page.render());
  assert.ok(content.some(node => node.type === 'FindingsGenerationAction'));
  assert.ok(content.some(node => node.props?.role === 'alert'));
  assert.ok(content.some(node => node.props?.href === '/projects/project/review'));
  assert.ok(!content.some(node => node.type === 'ProfessionalReviewAction'), 'Do not offer to create a new professional run after a read failure');
});

test('missing primary workflow redirects before any optional professional read', async () => {
  for (const options of [{ findings: null }, { workflow: false }]) {
    const page = loadPage({ ...options, revealed: true });
    await assert.rejects(page.render(), /redirect:/);
    assert.equal(page.reads(), 0);
  }
});

test('completed Quick Findings opens the human confirmation editor after reveal', async () => {
  const page = loadPage({ revealed: true, findings: { ...workspace, latest: { id: 'finding', status: 'completed', humanConfirmedAt: null, effectiveOutput: { findings: [] } } } });
  const content = nodes(await page.render());
  assert.ok(content.some(node => node.type === 'FindingsEditor'));
  assert.equal(page.reads(), 1);
});

test('revisiting quick findings never automatically starts or retries generation', async () => {
  for (const latest of [null, { id: 'finding', status: 'failed', errorMessage: 'fixture failure' }]) {
    const page = loadPage({ revealed: true, findings: { ...workspace, evaluationMode: 'quick', latest } });
    const content = nodes(await page.render());
    const action = content.find(node => node.type === 'FindingsGenerationAction');
    assert.ok(action, 'Explicit recovery action remains available');
    assert.ok(!action.props.autoStart, 'Opening a result page must not submit a generation form');
  }
});

test('legacy confirmed Findings remain readable without fabricating a Blind Review', async () => {
  const page = loadPage({ confirmed: true, findings: { ...workspace, projectName: 'Legacy', artifacts: [], latest: { id: 'finding', status: 'completed', humanConfirmedAt: '2026-09-21', effectiveOutput: { summary: '历史确认结论', findings: [], limitations: [] } } } });
  const content = nodes(await page.render());
  assert.ok(content.includes('历史确认结论'));
  assert.equal(page.reads(), 0, 'Do not ask Judge services to read a legacy project without samples');
});
