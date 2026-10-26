import assert from 'node:assert/strict';

const guidedStages = new Set(['CommunityStoryBrief', 'CommunityPostDraft', 'CommunityPostRevision']);

// Local evaluation only. No app import, remote loading, or reference-video facts.
export function styleGuidance(profile) {
  assert.equal(profile.id, 'task-led-review');
  assert.equal(profile.version, '0.1.0-candidate');
  assert.equal(profile.status, 'research_candidate_not_evaluated');
  assert.equal(profile.runtime_enabled, false);
  assert.equal(profile.rules.length, 8);
  return [
    `本地对照候选风格卡 ${profile.id}/${profile.version}。以下仅指导表达，当前事实、作者输入、JSON契约和独立终审优先。不提供新事实，不模仿参考作者身份。`,
    ...profile.rules.map(rule => `${rule.id} ${rule.title}：${rule.instruction} 适用条件：${rule.apply_when}`),
    ...profile.editorial_adaptations,
    '不要把八条规则变成八个小标题或固定段落；按本次证据决定是否采用。没有记录的情绪、预期转变与操作过程不要补齐。',
  ].join('\n');
}

export function withStyleVariant(options, variant, profile) {
  assert.ok(['current', 'style-card'].includes(variant));
  if (variant === 'current' || !guidedStages.has(options.schemaName)) return options;
  const guidance = styleGuidance(profile);
  assert.equal(options.messages.filter(message => message.role === 'system').length, 1);
  return { ...options, messages: options.messages.map(message => message.role === 'system'
    ? { ...message, content: `${message.content}\n\n${guidance}` } : message) };
}

export function assertProviderDestination(input, init) {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  assert.equal(url.protocol, 'https:');
  assert.ok(['api.moonshot.cn', 'api.deepseek.com'].includes(url.hostname), 'Local pair forbids DB, Storage and other destinations');
  assert.ok(['/v1/chat/completions', '/chat/completions'].includes(url.pathname));
  assert.equal(url.search, '');
  assert.equal(method, 'POST');
}
