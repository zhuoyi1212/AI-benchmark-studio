import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { assertProviderDestination, styleGuidance, withStyleVariant } from '../scripts/lib/style-pair.mjs';
import { harness } from './helpers/publication.mjs';

const profile = JSON.parse(await readFile(new URL('../docs/research/turingscat-20261026/style-profile.json', import.meta.url), 'utf8'));

test('the local pair changes only candidate creative system instructions and preserves the current Skill and independent audits', async () => {
  const h = harness();
  await h.run();
  const skill = h.load('@/lib/ai/skills/de-ai-flavor-source').deAiFlavorSkillText;
  for (const call of h.state.calls) {
    const frozen = JSON.stringify(call.messages);
    assert.equal(withStyleVariant(call, 'current', profile), call);
    const candidate = withStyleVariant(call, 'style-card', profile);
    assert.equal(candidate.schema, call.schema);
    assert.equal(candidate.maxTokens, call.maxTokens);
    assert.equal(candidate.maxAttempts, call.maxAttempts);
    assert.deepEqual(candidate.messages.filter(item => item.role !== 'system'), call.messages.filter(item => item.role !== 'system'));
    if (['CommunityStoryBrief', 'CommunityPostDraft', 'CommunityPostRevision'].includes(call.schemaName)) {
      assert.equal(candidate.messages[0].content, call.messages[0].content + '\n\n' + styleGuidance(profile));
      if (call.schemaName === 'CommunityPostDraft') assert.ok(candidate.messages[0].content.includes(skill));
    } else assert.equal(candidate, call);
    assert.equal(JSON.stringify(call.messages), frozen);
  }
  const guidance = styleGuidance(profile);
  assert.equal(guidance.includes('bilibili'), false);
  assert.equal(guidance.includes('图灵的猫'), false);
  assert.equal(guidance.includes('observation'), false);
  assert.match(guidance, /JSON契约.*终审优先/);
});

test('the frozen local pair network guard permits only configured writing and text-audit endpoints', () => {
  for (const url of ['https://api.moonshot.cn/v1/chat/completions', 'https://api.deepseek.com/chat/completions']) assert.doesNotThrow(() => assertProviderDestination(url, { method: 'POST' }));
  for (const url of ['https://example.supabase.co/rest/v1/publish_packs', 'https://api.moonshot.cn/other', 'https://api.deepseek.com/chat/completions?token=x', 'http://api.deepseek.com/chat/completions', 'https://api.deepseek.com.evil.invalid/chat/completions']) assert.throws(() => assertProviderDestination(url, { method: 'POST' }));
  assert.throws(() => assertProviderDestination('https://api.deepseek.com/chat/completions', { method: 'DELETE' }));
});
