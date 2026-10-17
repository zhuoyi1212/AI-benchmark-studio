import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { z } from 'zod';
import createLoader from '../scripts/lib/load-typescript.cjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const usage = { prompt_tokens: 10, completion_tokens: 20 };
const envelope = content => ({ choices: [{ message: { content, reasoning_content: 'private-thinking-fixture' }, finish_reason: 'stop' }], usage });
const request = { task: 'community_post', model: 'kimi-k3', messages: [{ role: 'user', content: 'Return JSON.' }], maxTokens: 600, reasoning: 'standard', attempt: 1, timeoutMs: 90_000 };

function fixture(responses = [envelope('{"ok":true}')]) {
  const calls = [];
  const load = createLoader(root, {
    '@/lib/ai/providers/http': { postProviderJson: async (...args) => {
      calls.push(args);
      const result = responses[Math.min(calls.length - 1, responses.length - 1)];
      if (typeof result === 'function') throw result(load);
      if (result instanceof Error) throw result;
      return { data: result, latencyMs: 12, status: 200 };
    } },
    '@/lib/env/server': {
      getAIProviderKey: provider => { assert.equal(provider, 'moonshot'); return 'fixture-key'; },
      getAIModelEnvironment: () => ({ moonshotWritingModel: 'kimi-k3', deepSeekWritingModel: 'deepseek-v4-flash', deepSeekReasoningModel: 'deepseek-v4-pro', zhipuVisionModel: 'glm-4.6v' }),
    },
  });
  return { calls, load, provider: new (load('@/lib/ai/providers/moonshot.provider').MoonshotProvider)('fixture-key') };
}

test('Kimi owns writing, revision and titles; discovery, independent review and Judge retain their routes', () => {
  const { resolveAITaskRoute } = createLoader(root)('@/lib/ai/config');
  for (const task of ['community_post', 'community_post_humanize', 'community_post_title']) {
    assert.equal(resolveAITaskRoute(task).provider, 'moonshot');
    assert.equal(resolveAITaskRoute(task).model, 'kimi-k3');
    assert.equal(resolveAITaskRoute(task).maxAttempts, 2);
  }
  for (const [task, provider] of [['content_discovery', 'deepseek'], ['community_post_evidence_check_text', 'deepseek'], ['community_post_evidence_check', 'zhipu'], ['judge_text', 'deepseek'], ['judge_multimodal', 'zhipu']]) {
    assert.equal(resolveAITaskRoute(task).provider, provider);
  }
});

test('Kimi key fails closed instead of reusing the DeepSeek key; model override stays server-side', () => {
  const saved = { ...process.env };
  try {
    delete process.env.MOONSHOT_API_KEY;
    process.env.DEEPSEEK_API_KEY = 'other-provider-fixture';
    const env = createLoader(root)('@/lib/env/server');
    assert.throws(() => env.getAIProviderKey('moonshot'), /MOONSHOT_API_KEY/);
    process.env.MOONSHOT_API_KEY = ' kimi-fixture ';
    assert.equal(env.getAIProviderKey('moonshot'), 'kimi-fixture');
    process.env.MOONSHOT_WRITING_MODEL = ' kimi-override-fixture ';
    assert.equal(env.getAIModelEnvironment().moonshotWritingModel, 'kimi-override-fixture');
  } finally {
    for (const name of ['MOONSHOT_API_KEY', 'DEEPSEEK_API_KEY', 'MOONSHOT_WRITING_MODEL']) {
      if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name];
    }
  }
});

test('K3 request uses JSON mode and a thinking-inclusive token budget; only final output is normalized', async () => {
  const f = fixture();
  const result = await f.provider.generateStructured(request);
  const [provider, endpoint, key, body, context] = f.calls[0];
  assert.equal(provider, 'moonshot');
  assert.equal(endpoint, 'https://api.moonshot.cn/v1/chat/completions');
  assert.equal(key, 'fixture-key');
  assert.deepEqual(body.response_format, { type: 'json_object' });
  assert.equal(body.reasoning_effort, 'low');
  assert.ok(body.max_completion_tokens >= request.maxTokens + 1000);
  assert.equal(body.stream, false);
  for (const field of ['thinking', 'max_tokens', 'temperature']) assert.ok(!Object.hasOwn(body, field));
  assert.equal(context.timeoutMs, request.timeoutMs);
  assert.equal(result.content, '{"ok":true}');
  assert.equal(result.usage.outputTokens, 20);
  assert.ok(!JSON.stringify(result).includes('private-thinking-fixture'));
  await f.provider.generateStructured({ ...request, reasoning: 'high' });
  assert.equal(f.calls[1][3].reasoning_effort, 'high');
});

test('JSON repair stays on Kimi and starts a fresh request without assistant reasoning history', async () => {
  const f = fixture([envelope('invalid JSON'), envelope('{"ok":true}')]);
  const events = [];
  const result = await f.load('@/lib/ai/router').runStructuredAITask('community_post', {
    schemaName: 'KimiRepairFixture', schema: z.object({ ok: z.literal(true) }),
    messages: request.messages, onResponse: async event => events.push(event),
  });
  assert.equal(result.attempts, 2);
  assert.equal(f.calls.length, 2);
  assert.ok(f.calls.every(call => call[0] === 'moonshot' && call[3].model === 'kimi-k3'));
  const repair = f.calls[1][3].messages;
  assert.ok(repair.every(message => message.role !== 'assistant'));
  assert.ok(JSON.stringify(repair).includes('invalid JSON'));
  assert.ok(JSON.stringify(repair).includes('Previous response was not valid JSON'));
  assert.ok(!JSON.stringify(events).includes('private-thinking-fixture'));
  assert.ok(events.every(event => event.route.provider === 'moonshot'));
  assert.deepEqual(events[1].messages, repair);
});

test('permanent invalid output is bounded; auth failures stop without fallback', async () => {
  const f = fixture([envelope('invalid JSON')]);
  const options = { schemaName: 'KimiFailureFixture', schema: z.object({ ok: z.boolean() }), messages: request.messages };
  await assert.rejects(f.load('@/lib/ai/router').runStructuredAITask('community_post', options), error => error.category === 'invalid_json');
  assert.equal(f.calls.length, 2);
  const auth = fixture([load => new (load('@/lib/ai/errors').AIProviderError)('Fixture auth denied', {
    provider: 'moonshot', model: 'kimi-k3', task: 'community_post', attempt: 1, latencyMs: 1, timeoutMs: 1000, status: 401, category: 'authentication',
  })]);
  await assert.rejects(auth.load('@/lib/ai/router').runStructuredAITask('community_post', options), error => error.category === 'authentication' && !error.retryable);
  assert.equal(auth.calls.length, 1);
});

test('new and historical provider metadata remain readable and credentials are never public', async () => {
  const load = createLoader(root);
  const { publishGenerationTraceSchema, titleRefreshAuditSchema } = load('@/lib/ai/schemas/publish.schemas');
  const metadata = { model: 'kimi-k3', promptVersion: 'fixture', inputSignature: 'fixture', usage: { inputTokens: 1, outputTokens: 2, latencyMs: 3, estimatedCost: null } };
  for (const provider of ['moonshot', 'deepseek', 'zhipu']) {
    assert.equal(publishGenerationTraceSchema.safeParse([{ ...metadata, provider, stage: 'writing' }]).success, true);
    assert.equal(titleRefreshAuditSchema.safeParse({ ...metadata, provider, previousTitle: '旧标题', title: '新标题', refreshedAt: '2026-10-17T00:00:00Z' }).success, true);
  }
  const env = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
  assert.match(env, /^MOONSHOT_API_KEY=$/m);
  assert.match(env, /^MOONSHOT_WRITING_MODEL=$/m);
  assert.doesNotMatch(env, /^NEXT_PUBLIC_.*(?:MOONSHOT|KIMI)/m);
  const audit = await readFile(new URL("../scripts/final-audit.mjs", import.meta.url), "utf8");
  assert.equal((audit.match(/MOONSHOT_API_KEY/g) ?? []).length, 3);
});

test('Kimi migration preserves publish functions and service-only grants with no history rewrite', async () => {
  const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const sql = await read('supabase/migrations/20261017060048_kimi_community_writing.sql');
  assert.match(sql, /check \(provider is null or provider in \('zhipu', 'deepseek', 'moonshot'\)\)/);
  for (const name of ['start_community_post', 'refresh_publish_pack_title']) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}[^;]+from public, anon, authenticated;`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}[^;]+to service_role;`));
  }
  assert.doesNotMatch(sql, /delete from|drop table|disable trigger|update public\.judge|alter table public\.(?!publish_packs)/i);
  assert.match(sql, /Only the latest PublishPack title can be refreshed/);
  assert.match(sql, /where id = p_publish_pack_id and status = 'draft' for update/);
});
