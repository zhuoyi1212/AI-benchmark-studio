import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import createLoader from '../scripts/lib/load-typescript.cjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const row = { id: 'protocol', project_id: 'project', research_run_id: 'research', version: 3, title: 'Neutral task', goal: 'test', status: 'locked', test_mode: 'standardized',
  rules: ['same-input', 'same-prompt', 'single-generation', 'no-editing', 'complete-upload'].map(id => ({ id, text: id })), created_at: 'now' };
function contextLoader({ project = { id: 'project', name: 'SECRET_PRODUCT', evaluation_mode: 'professional' }, protocols = [row] } = {}) {
  return createLoader(root, {
    '@/lib/services/research.service': { getResearchWorkspace: () => { throw new Error('Locked reads must not rebuild research'); } },
    '@/lib/repositories/projects.repository': { projectsRepository: { findActiveById: async () => project } },
    '@/lib/repositories/protocols.repository': { protocolsRepository: { listByProject: async () => protocols, listTestCases: async () => [], listRubric: async () => [] } },
  });
}
test('locked context reads stored protocol without research and rejects archived projects or newer drafts', async () => {
  const result = await contextLoader()('@/lib/services/protocols.service').getLockedProtocolContext('project');
  assert.equal(result.protocol.id, 'protocol'); assert.equal(result.protocol.version, 3);
  for (const fixture of [{ project: null }, { protocols: [] }, { protocols: [{ ...row, status: 'draft' }, row] }]) {
    assert.equal(await contextLoader(fixture)('@/lib/services/protocols.service').getLockedProtocolContext('project'), null);
  }
});

test('lean Blind projection still checks identity safety before reading samples and exposes no identity', async () => {
  const calls = [];
  const load = createLoader(root, {
    '@/lib/services/protocols.service': { getLockedProtocolContext: async () => ({ project: { evaluation_mode: 'professional', name: 'SECRET_PRODUCT' }, protocol: { id: 'protocol', version: 3, testCases: [{ id: 'case', title: 'Neutral task' }] } }) },
    '@/lib/repositories/blind-review.repository': { blindReviewRepository: {
      assertProtocolSafe: async () => { calls.push('guard'); }, listSamples: async () => { calls.push('samples'); return [{ id: 'sample', label: 'Sample A' }]; },
    } },
  });
  const result = await load('@/lib/services/blind-review.service').getBlindReviewWorkspace('project');
  assert.deepEqual(calls, ['guard', 'samples']); assert.equal(result.protocolVersion, 3);
  assert.doesNotMatch(JSON.stringify(result), /SECRET_PRODUCT|productName|productId/);
});

test('latest-only read queries preserve latest failures and unlimited history access', async () => {
  const versions = [{ version: 3, attempt: 3, status: 'failed' }, { version: 2, attempt: 2, status: 'ready' }, { version: 1, attempt: 1, status: 'ready' }];
  class Query {
    select() { return this; } eq() { return this; }
    order(_field, options) { assert.equal(options.ascending, false); return this; }
    limit(value) { this.maximum = value; return this; }
    then(resolve, reject) { return Promise.resolve({ data: this.maximum ? versions.slice(0, this.maximum) : versions, error: null }).then(resolve, reject); }
  }
  const load = createLoader(root, { '@/lib/supabase/server': { getSupabaseServerClient: () => ({ from: () => new Query() }) } });
  const operations = [
    [load('@/lib/repositories/publish.repository').publishRepository, 'listByFindings'],
    [load('@/lib/repositories/publish.repository').publishRepository, 'listByReport'],
    [load('@/lib/repositories/report.repository').reportRepository, 'listByAnalysis'],
    [load('@/lib/repositories/result-analysis.repository').resultAnalysisRepository, 'listByReview'],
  ];
  for (const [repository, method] of operations) {
    assert.deepEqual(await repository[method]('source', 1), [versions[0]]);
    assert.deepEqual(await repository[method]('source'), versions);
  }
});

test('Vercel instrumentation omits the local poller while local workers and media routes stay intact', async () => {
  const load = createLoader(root); const config = load('@/next.config').default;
  class Replacement { constructor(pattern, replacement) { this.pattern = pattern; this.replacement = replacement; } }
  const previous = process.env.VERCEL;
  try {
    delete process.env.VERCEL;
    assert.equal(config.webpack({ plugins: [] }, { isServer: true, webpack: { NormalModuleReplacementPlugin: Replacement } }).plugins.length, 0);
    process.env.VERCEL = '1';
    const server = config.webpack({ plugins: [] }, { isServer: true, webpack: { NormalModuleReplacementPlugin: Replacement } });
    assert.ok(server.plugins[0].pattern.test('./lib/quick/node-worker'));
    assert.match(server.plugins[0].replacement, /vercel-node-worker\.ts$/);
    assert.equal(config.webpack({ plugins: [] }, { isServer: false, webpack: { NormalModuleReplacementPlugin: Replacement } }).plugins.length, 0);
    assert.equal(config.outputFileTracingIncludes['/*'], undefined);
    assert.ok(config.outputFileTracingIncludes['/api/media/runtime'].some(path => path.includes('linux-x64/package.json')));
    assert.ok(config.outputFileTracingIncludes['/api/cron/quick-workflow'].some(path => path.includes('ffmpeg-static/ffmpeg')));
    assert.ok(config.outputFileTracingIncludes['/projects/*'].some(path => path.includes('ffmpeg-static/ffmpeg')));
  } finally { if (previous === undefined) delete process.env.VERCEL; else process.env.VERCEL = previous; }
});
