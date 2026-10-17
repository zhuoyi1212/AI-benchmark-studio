import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { z } from 'zod';

async function load(path, dependencies) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const fixtureModule = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => { assert.ok(name in dependencies, name); return dependencies[name]; }, fixtureModule, fixtureModule.exports);
  return fixtureModule.exports;
}
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
class RepositoryError extends Error {}
async function action(mutate) {
  const invalidations = [];
  const api = await load('../app/products/actions.ts', {
    'next/cache': { revalidatePath: (...args) => invalidations.push(args) },
    zod: { z },
    '@/lib/repositories/repository-error': { RepositoryError },
    '@/lib/services/product-library.service': { setProductArchived: mutate },
  });
  return { ...api, invalidations };
}
test('archive actions reject malformed parameters before any write', async () => {
  let writes = 0;
  const api = await action(async () => { writes++; return true; });
  assert.equal((await api.setProductArchivedAction('bad', true)).ok, false);
  assert.equal((await api.setProductArchivedAction(id, 'true')).ok, false);
  assert.equal(writes, 0);
});
test('delete and restore invalidate library, details and product selection', async () => {
  const writes = [];
  const api = await action(async (...args) => { writes.push(args); return true; });
  assert.deepEqual(await api.setProductArchivedAction(id, true), { ok: true });
  assert.deepEqual(await api.setProductArchivedAction(id, false), { ok: true });
  assert.deepEqual(writes, [[id, true], [id, false]]);
  assert.deepEqual(api.invalidations, [['/products', 'layout'], ['/projects/new'], ['/products', 'layout'], ['/projects/new']]);
});
test('missing product and database failures never report a successful deletion', async () => {
  for (const mutate of [async () => false, async () => { throw new RepositoryError('secret database error'); }]) {
    const api = await action(mutate);
    const result = await api.setProductArchivedAction(id, true);
    assert.equal(result.ok, false);
    assert.doesNotMatch(result.message, /secret/);
    assert.deepEqual(api.invalidations, []);
  }
});
test('repository archive and restore update only selected product visibility with state guards', async () => {
  const operations = [];
  let record = { id };
  const query = {};
  for (const method of ['update', 'eq', 'is', 'not', 'select']) query[method] = (...args) => { operations.push([method, ...args]); return query; };
  query.maybeSingle = async () => ({ data: record, error: null });
  const { productLibraryRepository: repo } = await load('../lib/repositories/product-library.repository.ts', {
    'server-only': {},
    '@/lib/repositories/repository-error': { throwRepositoryError: () => { throw new Error('db'); } },
    '@/lib/supabase/server': { getSupabaseServerClient: () => ({ from: table => { operations.push(['from', table]); return query; } }) },
  });
  assert.equal(await repo.setArchived(id, true), true);
  assert.deepEqual(operations[0], ['from', 'products']);
  assert.deepEqual(Object.keys(operations[1][1]), ['archived_at']);
  assert.ok(Number.isFinite(Date.parse(operations[1][1].archived_at)));
  assert.deepEqual(operations.slice(2), [['eq', 'id', id], ['is', 'archived_at', null], ['select', 'id']]);
  operations.length = 0;
  assert.equal(await repo.setArchived(id, false), true);
  assert.deepEqual(operations, [['from', 'products'], ['update', { archived_at: null }], ['eq', 'id', id], ['not', 'archived_at', 'is', null], ['select', 'id']]);
  record = null;
  assert.equal(await repo.setArchived(id, true), false);
});
