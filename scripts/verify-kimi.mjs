// Minimal paid smoke test. Uses synthetic text only; never writes a Project.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import createLoader from './lib/load-typescript.cjs';

if (!process.env.MOONSHOT_API_KEY?.trim()) throw new Error('Configure MOONSHOT_API_KEY in .env.local and run with node --env-file=.env.local');
const load = createLoader(fileURLToPath(new URL('..', import.meta.url)));
const { runStructuredAITask } = load('@/lib/ai/router');
const result = await runStructuredAITask('community_post', {
  schemaName: 'KimiConnectivityCheck', schema: z.object({ status: z.literal('ok') }),
  messages: [{ role: 'user', content: '仅返回 JSON：{"status":"ok"}。这是连接测试，不生成测评内容。' }],
  maxTokens: 128, maxAttempts: 1,
});
assert.equal(result.route.provider, 'moonshot');
assert.equal(result.data.status, 'ok');
console.log(JSON.stringify({ provider: result.route.provider, model: result.route.model, status: result.data.status, usage: result.usage }));
