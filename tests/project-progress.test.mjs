import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const createLoader = require('../scripts/lib/load-typescript.cjs');
const root = fileURLToPath(new URL('..', import.meta.url));

function harness({ protocols = [], runs = [], projects = [], failTable = null } = {}) {
  const calls = [];
  const client = {
    from(table) {
      const call = { table, filters: [] };
      calls.push(call);
      const query = {
        select() { return query; },
        in(column, values) { call.filters.push([column, values]); return query; },
        eq(column, value) { call.filters.push([column, [value]]); return query; },
        is() { return query; },
        order(column, options) { call.order = [column, options]; return query; },
        maybeSingle() { call.single = true; return query; },
        then(resolve, reject) {
          if (table === failTable) return Promise.resolve({ data: null, error: { message: 'database unavailable' } }).then(resolve, reject);
          let data = [...({ protocols, test_runs: runs, projects, project_products: [] }[table])];
          for (const [column, values] of call.filters) data = data.filter(row => values.includes(row[column]));
          if (call.order) {
            const [column, { ascending }] = call.order;
            data.sort((a, b) => ascending ? a[column] - b[column] : b[column] - a[column]);
          }
          return Promise.resolve({ data: call.single ? data[0] ?? null : data, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const load = createLoader(root, { '@/lib/supabase/server': { getSupabaseServerClient: () => client } });
  return { calls, repository: load('@/lib/repositories/projects.repository').projectsRepository, service: load('@/lib/services/projects.service') };
}

const protocol = (id, project_id, version) => ({ id, project_id, version });
const run = (id, project_id, protocol_id, status) => ({ id, project_id, protocol_id, status });
const project = id => ({ id, name: 'Real project', evaluation_mode: 'quick', status: 'published' });

test('completed current round ignores an abandoned pending historical round in list and sidebar summaries', async () => {
  const { service } = harness({
    projects: [project('video')],
    protocols: [protocol('v1', 'video', 1), protocol('v2', 'video', 2)],
    runs: [run('old', 'video', 'v1', 'pending'), run('current', 'video', 'v2', 'ready_for_review')],
  });
  const [summary] = await service.listProjectSummaries();
  assert.deepEqual(summary.progress, { completed: 1, total: 1, percent: 100 });
  assert.deepEqual((await service.getProjectSummary('video')).progress, summary.progress);
});

test('historical completed runs cannot make an unfinished current round appear complete', async () => {
  const { service } = harness({
    projects: [project('p')],
    protocols: [protocol('old', 'p', 1), protocol('new', 'p', 2)],
    runs: [run('a', 'p', 'old', 'ready_for_review'), run('b', 'p', 'new', 'pending'), run('c', 'p', 'new', 'uploaded'), run('d', 'p', 'new', 'invalid')],
  });
  assert.deepEqual((await service.getProjectSummary('p')).progress, { completed: 1, total: 3, percent: 33 });
});

test('batch reads select each project current version independently with two reads', async () => {
  const { repository, calls } = harness({
    protocols: [protocol('a1', 'a', 1), protocol('b1', 'b', 1), protocol('a9', 'a', 9), protocol('b2', 'b', 2)],
    runs: [run('oldA', 'a', 'a1', 'pending'), run('oldB', 'b', 'b1', 'pending'), run('a', 'a', 'a9', 'uploaded'), run('b', 'b', 'b2', 'ready_for_review')],
  });
  assert.deepEqual((await repository.listProgressRows(['a', 'b'])).map(row => row.id), ['a', 'b']);
  assert.equal(calls.length, 2);
});

test('a new current draft without test runs resets progress instead of reusing a completed old plan', async () => {
  const { service } = harness({
    projects: [project('p')],
    protocols: [protocol('locked', 'p', 1), { ...protocol('draft', 'p', 2), status: 'draft' }],
    runs: [run('old', 'p', 'locked', 'ready_for_review')],
  });
  assert.deepEqual((await service.getProjectSummary('p')).progress, { completed: 0, total: 0, percent: 0 });
});

test('projects without a protocol have zero progress and empty lists do not query the database', async () => {
  const { service, repository, calls } = harness({ projects: [project('p')] });
  assert.deepEqual((await service.getProjectSummary('p')).progress, { completed: 0, total: 0, percent: 0 });
  const before = calls.length;
  assert.deepEqual(await repository.listProgressRows([]), []);
  assert.equal(calls.length, before);
  assert.ok(calls.every(call => call.table !== 'test_runs'));
});

test('failed protocol or test reads never return a fake completed progress', async () => {
  for (const failTable of ['protocols', 'test_runs']) {
    const { repository } = harness({ protocols: [protocol('v1', 'p', 1)], failTable });
    await assert.rejects(repository.listProgressRows(['p']), /Database operation failed/);
  }
});
