import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import ts from 'typescript';

function load() {
  const code = ts.transpileModule(readFileSync(new URL('../lib/supabase/read-scope.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => {
    if (name === 'server-only') return {};
    if (name === 'node:async_hooks') return { AsyncLocalStorage };
    throw new Error(name);
  }, exports);
  return exports;
}

test('one page coalesces concurrent and sequential GETs with independently readable responses', async () => {
  const { withPageReads, fetchPageRead } = load();
  let requests = 0;
  const read = () => fetchPageRead('https://db.example/rows', undefined, async () => Response.json({ version: ++requests }));
  await withPageReads(async () => {
    const responses = await Promise.all([read(), read()]);
    responses.push(await read());
    assert.deepEqual(await Promise.all(responses.map(r => r.json())), [{ version: 1 }, { version: 1 }, { version: 1 }]);
  })();
  assert.equal(requests, 1);
});

test('new renders, concurrent visitors and operations outside a render always read fresh state', async () => {
  const { withPageReads, fetchPageRead } = load();
  let requests = 0;
  const read = () => fetchPageRead('https://db.example/rows', undefined, async () => Response.json(++requests));
  const render = withPageReads(async () => (await read()).json());
  assert.deepEqual(await Promise.all([render(), render()]), [1, 2]);
  assert.equal(await render(), 3);
  await read(); await read();
  assert.equal(requests, 5);
});

test('identity headers and query URLs never share a cached response', async () => {
  const { withPageReads, fetchPageRead } = load();
  let requests = 0;
  await withPageReads(async () => {
    for (const [url, token] of [['a', 'alice'], ['a', 'bob'], ['b', 'alice']]) {
      await fetchPageRead(`https://db.example/${url}`, { headers: { Authorization: token } }, async () => Response.json(++requests));
    }
  })();
  assert.equal(requests, 3);
});

test('mutations and explicitly abortable reads are never coalesced', async () => {
  const { withPageReads, fetchPageRead } = load();
  let requests = 0;
  await withPageReads(async () => {
    for (const init of [{ method: 'POST' }, { method: 'PATCH' }, { method: 'DELETE' }, { signal: new AbortController().signal }]) {
      for (let n = 0; n < 2; n++) await fetchPageRead('https://db.example/rows', init, async () => Response.json(++requests));
    }
  })();
  assert.equal(requests, 8);
});

test('HTTP failures and rejected reads may be retried within the same page', async () => {
  const { withPageReads, fetchPageRead } = load();
  let requests = 0;
  await withPageReads(async () => {
    const read = () => fetchPageRead('https://db.example/rows', undefined, async () => {
      requests++;
      if (requests === 1) throw new Error('disconnected');
      return new Response('result', { status: requests === 2 ? 503 : 200 });
    });
    await assert.rejects(read(), /disconnected/);
    assert.equal((await read()).status, 503);
    assert.equal((await read()).status, 200);
    assert.equal((await read()).status, 200);
  })();
  assert.equal(requests, 3);
});

test('composed workspace reads share signed artifacts only within a single render', async () => {
  const { withPageReads, memoPageRead } = load(); let count = 0;
  const read = () => memoPageRead('workspace:project', async () => ({ generation: ++count, signedUrl: 'fixture' }));
  const render = withPageReads(async () => {
    const [a, b] = await Promise.all([read(), read()]); assert.equal(a, b);
    return a.generation;
  });
  assert.deepEqual(await Promise.all([render(), render()]), [1, 2]);
  assert.equal(await render(), 3);
  assert.equal((await read()).generation, 4); assert.equal((await read()).generation, 5);
});

test('failed workspace reads can retry and different projects never reuse a result', async () => {
  const { withPageReads, memoPageRead } = load(); let count = 0;
  await withPageReads(async () => {
    const read = () => memoPageRead('workspace:a', async () => { if (++count === 1) throw new Error('offline'); return 'a'; });
    await assert.rejects(read(), /offline/); assert.equal(await read(), 'a'); assert.equal(await read(), 'a');
    assert.equal(await memoPageRead('workspace:b', async () => 'b'), 'b'); assert.equal(count, 2);
  })();
});
