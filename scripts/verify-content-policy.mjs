// Real model, synthetic evidence, in-memory repository: never modifies production data.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { harness, quick, config } from '../tests/helpers/publication.mjs';
if (!process.argv.includes('--live')) throw new Error('Use --live to opt into provider calls on synthetic evidence.');
const out = `/private/tmp/content-policy-probe-${Date.now()}`;
await mkdir(out, { recursive: true });
console.log(JSON.stringify({ output: out }));
const h = harness({ realAI: true });
const tasks = h.load('@/lib/ai/task-service').aiTaskService;
for (const name of ['generateCommunityPost', 'humanizeCommunityPost', 'factCheckTextCommunityPost', 'factCheckCommunityPost']) {
  const invoke = tasks[name];
  tasks[name] = options => invoke({ ...options, onResponse: async event => {
    await writeFile(`${out}/${options.schemaName}-${event.attempt}.json`, JSON.stringify({ content: event.content, route: event.route, usage: event.usage }, null, 2));
    await options.onResponse?.(event);
  } });
}
try {
  await h.run({ ...config, structure: '自由结构', length: '300字以内，材料少就简短，不凑字数' });
  assert.equal(h.state.saved.contentPolicyVersion, 'community-content.v1');
  assert.equal(h.state.saved.generationTrace.length, 4);
  await writeFile(`${out}/post.json`, JSON.stringify(h.state.saved, null, 2));
  await writeFile(`${out}/sample.md`, `> 合成素材验证稿，不能作为真实产品测评发布。\n\n# ${h.state.saved.title}\n\n${h.state.saved.body}\n`);
  console.log(JSON.stringify({ status: 'passed', output: out, title: h.state.saved.title, body: h.state.saved.body, stages: h.state.saved.generationTrace.map(t => t.stage) }));
} catch (error) {
  console.error(JSON.stringify({ status: 'failed', output: out, error: error.message }));
  process.exitCode = 1;
}
