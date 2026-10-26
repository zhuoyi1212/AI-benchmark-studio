import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import createLoader from '../scripts/lib/load-typescript.cjs';
import { harness } from './helpers/publication.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const artifacts = Array.from({ length: 4 }, (_, index) => ({ id: `image-${index}`, fileName: `fixture-${index}.png`, fileType: 'image/png', fileUrl: `https://fixture.invalid/${index}.png` }));

function fixture(failure, permanent = false) {
  const requests = [];
  class Provider {
    async generateStructured(request) {
      requests.push(request);
      const images = request.messages.flatMap(message => Array.isArray(message.content) ? message.content : []).filter(part => part.type === 'image_url');
      const observations = images.map(part => `截图原文含 ASCII 双引号 "${part.image_url.url.split('/').at(-1)}"。`);
      const content = request.attempt === 1 || permanent
        ? failure === 'wrapper' ? JSON.stringify({ answer: { observations } }) : '识别结果：' + JSON.stringify({ observations })
        : JSON.stringify({ observations });
      return { content, finishReason: 'stop', requestId: null, usage: { inputTokens: 1, outputTokens: 1, latencyMs: 1, estimatedCost: null } };
    }
  }
  const load = createLoader(root, {
    // This suite tests provider JSON repair; image transport has its own real-code suite.
    '@/lib/services/analysis-image.service': { imageForAI: async image => ({ url: image.fileUrl, description: 'fixture image transport' }) },
    '@/lib/ai/config': { resolveAITaskRoute: task => ({ task, provider: 'zhipu', model: 'fixture', promptVersion: 'fixture', reasoning: 'standard', repairReasoning: 'standard', timeoutMs: 1000, maxAttempts: 2 }) },
    '@/lib/env/server': { getAIProviderKey: () => 'fixture' },
    '@/lib/ai/providers/zhipu.provider': { ZhipuProvider: Provider },
    '@/lib/services/test-execution.service': { getTestExecutionWorkspace: async () => ({
      project: { id: 'project', name: 'synthetic screenshots', products: [{ id: 'product', name: 'fixture' }] },
      protocol: { id: 'protocol', testCases: [{ id: 'case', title: 'fixture task', expectedOutputTypes: ['image'] }] },
      testRuns: [{ id: 'run', productId: 'product', testCaseId: 'case', status: 'ready_for_review', artifacts }],
    }) },
    '@/lib/services/research.service': { getResearchWorkspace: async () => ({ completedResult: { products: [] } }) },
  });
  return { requests, load, service: load('@/lib/services/findings.service') };
}

for (const failure of ['wrapper', 'invalid_json']) test(`four screenshots retain order, evidence and escaped text through bounded ${failure} repair`, async () => {
  const { requests, service } = fixture(failure);
  const content = await service.buildRawFindingsEvidenceContent('project', { preferPdfText: true });
  assert.equal(requests.length, 4);
  assert.deepEqual(requests.map(request => request.attempt), [1, 2, 1, 2]);
  for (const index of [0, 2]) {
    const original = requests[index].messages.flatMap(message => Array.isArray(message.content) ? message.content : []).filter(part => part.type === 'image_url');
    const repair = requests[index + 1].messages;
    assert.deepEqual(repair.flatMap(message => Array.isArray(message.content) ? message.content : []).filter(part => part.type === 'image_url'), original);
    assert.deepEqual(repair.at(-1).content.filter(part => part.type === 'image_url'), original);
    assert.match(repair.at(-1).content.at(-1).text, /长度必须是 2/);
    assert.match(repair.at(-1).content.at(-1).text, /不加 answer 包装/);
    assert.ok(requests[index].messages.some(message => typeof message.content === 'string' && message.content.includes('唯一字段是 observations')));
  }
  const observed = content.filter(part => part.text?.includes('Screenshot observation:'));
  assert.equal(observed.length, 4);
  for (const [index, part] of observed.entries()) {
    assert.ok(part.text.includes(`artifactId: image-${index}`));
    assert.ok(part.text.includes(`"${index}.png"`));
  }
});

test('permanently invalid screenshot JSON stops after two attempts instead of omitting evidence', async () => {
  const { requests, service } = fixture('invalid_json', true);
  await assert.rejects(service.buildRawFindingsEvidenceContent('project'), error => error.schemaName === 'FindingsScreenshotObservations' && error.category === 'invalid_json');
  assert.equal(requests.length, 2);
});

for (const category of ['invalid_json', 'schema_validation']) test(`screenshot ${category} failure is correctly reported before drafting and cannot save ready`, async () => {
  const h = harness({ raw: () => {
    const { AIValidationError } = h.load('@/lib/ai/errors');
    throw new AIValidationError('screenshot_understanding', 'FindingsScreenshotObservations', { category });
  } });
  await assert.rejects(h.run(), /读取写作材料：截图识别/);
  assert.match(h.state.failure, category === 'invalid_json' ? /无效 JSON/ : /条数或字段格式不正确/);
  assert.doesNotMatch(h.state.failure, /社区内容返回的数据/);
  assert.equal(h.state.calls.length, 0); assert.equal(h.state.saved, null);
});

test('prompt inventory contains the exact screenshot prompt and repair contract', async () => {
  const { screenshotObservationRules, screenshotObservationRepairInstruction } = createLoader(root)('@/lib/screenshot-observations');
  const inventory = await readFile(new URL('../docs/ai-prompt-inventory.md', import.meta.url), 'utf8');
  assert.ok(inventory.includes(screenshotObservationRules(2)));
  assert.ok(inventory.includes(screenshotObservationRepairInstruction(2)));
});

test('native document repair moves every original file and its labels into the active turn once', async () => {
  const { requests, load } = fixture('invalid_json');
  const first = [{ type: 'text', text: '原始文件1' }, { type: 'file_url', file_url: { url: 'https://fixture.invalid/one.pdf' } }];
  const second = [{ type: 'text', text: '原始文件2' }, { type: 'file_url', file_url: { url: 'https://fixture.invalid/two.pdf' } }];
  await load('@/lib/ai/router').runStructuredAITask('screenshot_understanding', {
    schemaName: 'DocumentRepairFixture', schema: z.object({ observations: z.array(z.string()) }),
    messages: [{ role: 'user', content: '只核对原始材料' }, { role: 'user', content: first }, { role: 'user', content: second }],
  });
  const repaired = requests[1].messages;
  assert.deepEqual(repaired.at(-1).content.slice(0, 4), [...first, ...second]);
  assert.equal(repaired.flatMap(message => Array.isArray(message.content) ? message.content : []).filter(part => part.type === 'file_url').length, 2);
  assert.ok(repaired.some(message => message.content === '只核对原始材料'));
});

test('text-only JSON repair keeps original messages and a text instruction', async () => {
  const { requests, load } = fixture('invalid_json');
  await load('@/lib/ai/router').runStructuredAITask('screenshot_understanding', {
    schemaName: 'TextRepairFixture', schema: z.object({ observations: z.array(z.string()) }),
    messages: [{ role: 'user', content: '原始文字材料' }],
  });
  assert.ok(requests[1].messages.some(message => message.content === '原始文字材料'));
  assert.equal(typeof requests[1].messages.at(-1).content, 'string');
});
