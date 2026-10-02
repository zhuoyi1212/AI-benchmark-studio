import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync(new URL('../app/api/cron/quick-workflow/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function load() {
  let calls = 0;
  const exports = {};
  new Function('require', 'exports', code)(name => {
    if (name === 'node:crypto') return { timingSafeEqual };
    if (name === '@/lib/quick/worker') return { runQuickWorker: async (projectId, count) => { assert.equal(projectId, undefined); assert.equal(count, 1); calls++; } };
    throw new Error(name);
  }, exports);
  return { ...exports, calls: () => calls };
}

test('public or incorrect cron requests cannot start billable background work', async () => {
  const original = process.env.CRON_SECRET;
  const service = load();
  try {
    delete process.env.CRON_SECRET;
    assert.equal((await service.GET(new Request('https://example.test/api/cron/quick-workflow', { headers: { authorization: 'Bearer ' } }))).status, 401);
    process.env.CRON_SECRET = 'test-only-scheduler-secret-not-production';
    for (const token of ['', 'Bearer wrong', 'Basic test', 'Bearer test-only-scheduler-secret-not-productioN']) {
      assert.equal((await service.GET(new Request('https://example.test/api/cron/quick-workflow', { headers: { authorization: token } }))).status, 401);
    }
    assert.equal(service.calls(), 0);
    const response = await service.GET(new Request('https://example.test/api/cron/quick-workflow', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(service.calls(), 1);
  } finally {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  }
});
