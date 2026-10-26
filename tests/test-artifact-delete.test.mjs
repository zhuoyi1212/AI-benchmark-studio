import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import createLoader from '../scripts/lib/load-typescript.cjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const projectId = '11111111-1111-4111-8111-111111111111';
const protocolId = '22222222-2222-4222-8222-222222222222';
const artifactId = '33333333-3333-4333-8333-333333333333';

function fixture({ cleanupFails = false, commitFails = false, finishFails = false } = {}) {
  const calls = [];
  const load = createLoader(root, { '@/lib/repositories/test-execution.repository': { testExecutionRepository: {
    removeArtifact: async (...ids) => { calls.push(['commit', ...ids]); if (commitFails) throw new Error('db down'); return { protocolId, storagePaths: ['original', 'preview', 'original'], cacheArtifactIds: [artifactId] }; },
    removeMediaCache: async id => { calls.push(['cache', id]); },
    removeStorageObject: async path => { calls.push(['storage', path]); if (cleanupFails) throw new Error('storage down'); },
    finishDeletion: async (...ids) => { calls.push(['finish', ...ids]); if (finishFails) throw new Error('receipt down'); },
  } } });
  return { calls, remove: (...args) => load('@/lib/services/test-execution.service').removeTestArtifact(...args) };
}

test('delete excludes the object before permanent cleanup, removes preview/cache, and records completion last', async () => {
  const f = fixture(); await f.remove(projectId, protocolId, artifactId);
  assert.deepEqual(f.calls, [['commit', projectId, protocolId, artifactId], ['cache', artifactId], ['storage', 'original'], ['storage', 'preview'], ['finish', projectId, artifactId]]);
});
test('DB rejection cannot delete Storage; invalid IDs cannot mutate anything', async () => {
  const f = fixture({ commitFails: true });
  await assert.rejects(f.remove(projectId, protocolId, 'bad'), /标识无效/);
  assert.deepEqual(f.calls, []);
  await assert.rejects(f.remove(projectId, protocolId, artifactId), /删除失败/);
  assert.equal(f.calls.length, 1);
});
for (const failure of ['cleanupFails', 'finishFails']) test(`${failure} surfaces pending cleanup and never claims successful deletion`, async () => {
  const f = fixture({ [failure]: true });
  await assert.rejects(f.remove(projectId, protocolId, artifactId), /存储清理未完成.*重试删除/);
  if (failure === 'cleanupFails') assert.ok(!f.calls.some(call => call[0] === 'finish'));
});
test('stale / running / missing-file database failures remain actionable', async () => {
  for (const [code, pattern] of [['P2101', /版本已变化/], ['P2102', /后台仍在/], ['P2103', /已不存在/]]) {
    const load = createLoader(root); const { RepositoryError } = load('@/lib/repositories/repository-error');
    load('@/lib/repositories/test-execution.repository').testExecutionRepository.removeArtifact = async () => { throw new RepositoryError('delete', { code, message: 'fixture' }); };
    await assert.rejects(load('@/lib/services/test-execution.service').removeTestArtifact(projectId, protocolId, artifactId), pattern);
  }
});
test('delete action refreshes changed evidence even if Storage cleanup needs retry', async () => {
  const invalidations = [];
  const load = createLoader(root, {
    'next/headers': { headers: async () => new Headers({ 'x-ai-benchmark-access': 'admin' }) },
    'next/cache': { revalidatePath: (...args) => invalidations.push(args) },
  });
  const service = load('@/lib/services/test-execution.service');
  service.removeTestArtifact = async () => { throw new service.TestExecutionError('存储清理未完成'); };
  const data = new FormData(); for (const [key, value] of Object.entries({ projectId, protocolId, artifactId })) data.set(key, value);
  const result = await load('@/app/projects/[projectId]/test/actions').removeTestArtifactAction({ ok: false, message: null }, data);
  assert.equal(result.ok, false); assert.match(result.message, /未完成/);
  assert.ok(invalidations.some(([path, scope]) => path === `/projects/${projectId}` && scope === 'layout'));
});
test('shared storage metadata keeps upload confirmation scoped to its own run', async () => {
  const calls = [];
  const query = { select: () => query, eq: (...args) => { calls.push(args); return query; }, maybeSingle: async () => ({ data: null, error: null }) };
  const load = createLoader(root, { '@/lib/supabase/server': { getSupabaseServerClient: () => ({ from: name => { assert.equal(name, 'available_test_artifacts'); return query; } }) } });
  await load('@/lib/repositories/test-execution.repository').testExecutionRepository.findArtifactByStoragePath('shared', 'current-run');
  assert.deepEqual(calls, [['storage_path', 'shared'], ['test_run_id', 'current-run']]);
});
test('removed objects are excluded from read repositories and current workflow; no binary copies or score rewrites', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261025134553_remove_individual_test_artifact.sql', import.meta.url), 'utf8');
  assert.match(sql, /security_invoker = true/);
  assert.match(sql, /alter table public.test_artifact_deletions enable row level security/);
  assert.match(sql, /previous.cleaned_at is null/);
  assert.match(sql, /from public.available_test_artifacts artifact/);
  assert.doesNotMatch(sql, /update public\.(judge_scores|human_review_events|test_artifacts)|delete from storage/i);
  for (const name of ['test-execution', 'report']) {
    const source = await readFile(new URL(`../lib/repositories/${name}.repository.ts`, import.meta.url), 'utf8');
    assert.match(source, /from\("available_test_artifacts"\)/);
  }
});

test('video cache cleanup handles nested keys and multiple Storage pages without touching other files', async () => {
  const prefix = `media-cache/${artifactId}`;
  const stored = new Set(Array.from({ length: 103 }, (_, index) => `${prefix}/signature/frame-${index}.json`));
  stored.add('media-cache/another-artifact/keep.json');
  const removed = []; let pages = 0;
  const storage = {
    list: async (path, { limit }) => {
      pages++;
      const children = new Map();
      for (const key of stored) {
        if (!key.startsWith(`${path}/`)) continue;
        const tail = key.slice(path.length + 1); const name = tail.split('/')[0];
        children.set(name, { name, id: tail.includes('/') ? null : `object-${name}` });
      }
      return { data: [...children.values()].slice(0, limit), error: null };
    },
    remove: async paths => { for (const path of paths) { removed.push(path); stored.delete(path); } return { error: null }; },
  };
  const load = createLoader(root, { '@/lib/supabase/server': { getSupabaseServerClient: () => ({ storage: { from: name => { assert.equal(name, 'benchmark-artifacts'); return storage; } } }) } });
  await load('@/lib/repositories/test-execution.repository').testExecutionRepository.removeMediaCache(artifactId);
  assert.equal(removed.length, 103); assert.ok(pages >= 4);
  assert.deepEqual([...stored], ['media-cache/another-artifact/keep.json']);
});

test('upload confirmation acquires the same project mutex before locking or validating a run', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261025145245_serialize_upload_and_removal.sql', import.meta.url), 'utf8');
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\(target_project_id::text,0\)\)/);
  assert.ok(sql.indexOf('pg_advisory_xact_lock') < sql.indexOf('for update'));
  assert.ok(sql.indexOf('pg_advisory_xact_lock') < sql.indexOf("target_status not in ('pending', 'uploaded')"));
  assert.match(sql, /Artifact storage path does not match its TestRun lineage/);
  assert.match(sql, /revoke all on function public.record_test_artifact/);
});
