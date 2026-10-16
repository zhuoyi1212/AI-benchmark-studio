import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, 'docs/portfolio');
const document = await readFile(path.join(directory, 'AI产品经理作品集.md'), 'utf8');

test('concise portfolio covers every workflow node with interfaces, gates and an evaluation method', () => {
  const nodes = document.split('\n').filter(line => /^\| N\d{2} /.test(line));
  assert.deepEqual(nodes.map(line => line.match(/N\d{2}/)[0]), Array.from({ length: 15 }, (_, index) => `N${String(index).padStart(2, '0')}`));
  for (const node of nodes) {
    const cells = node.trim().slice(1, -1).split('|').map(value => value.trim());
    assert.equal(cells.length, 4);
    assert.ok(cells[1].includes('→'), `Missing input/output contract: ${cells[0]}`);
    assert.ok(cells[2].length > 10 && cells[3].length > 10, `Missing gate or evaluation: ${cells[0]}`);
  }
  assert.equal((document.match(/^## /gm) ?? []).length, 6);
});

test('portfolio model names and task ownership agree with the actual default router', () => {
  const require = createRequire(import.meta.url);
  const load = require('../scripts/lib/load-typescript.cjs')(root);
  const { resolveAITaskRoute } = load('@/lib/ai/config');
  for (const [task, provider, model] of [
    ['research_search', 'zhipu', 'search-prime'],
    ['research', 'zhipu', 'glm-5.2'],
    ['protocol', 'deepseek', 'deepseek-v4-pro'],
    ['content_discovery', 'deepseek', 'deepseek-v4-pro'],
    ['community_post', 'deepseek', 'deepseek-v4-flash'],
    ['community_post_evidence_check_text', 'deepseek', 'deepseek-v4-flash'],
    ['findings', 'zhipu', 'glm-4.6v'],
    ['judge_multimodal', 'zhipu', 'glm-4.6v'],
  ]) {
    const route = resolveAITaskRoute(task);
    assert.equal(route.provider, provider, `${task}: reassess documented ownership`);
    assert.equal(route.model, model, `${task}: reassess documented default model`);
    assert.ok(document.includes(model));
  }
  assert.match(document, /环境变量可覆盖/);
  assert.match(document, /统一模型对照尚待完成/);
});

test('portfolio keeps evaluation denominators and unverified outcomes explicit', () => {
  for (const requirement of ['首次链路成功率', '人工判有问题', '人工判可用', '失败、重试、实测、审核与编辑', '分母为0记不适用', '留出', '同源项目', '不直接充当独立标准答案']) {
    assert.ok(document.includes(requirement), `Missing evaluation constraint: ${requirement}`);
  }
  assert.match(document, /原项目为2026年8–9月/);
  assert.match(document, /与 Codex 协作/);
  assert.match(document, /以上统一实验尚待执行/);
  assert.doesNotMatch(document, /准确率达到\s*\d|降本\s*\d+%|节省\s*\d+%/);
});

test('final portfolio references and editable artifact exist without private backup links', async () => {
  for (const [, target] of document.matchAll(/\]\(([^)]+)\)/g)) {
    if (target.startsWith('https://')) continue;
    const resolved = path.resolve(directory, target);
    assert.ok(!path.relative(root, resolved).startsWith('..'));
    assert.ok((await stat(resolved)).isFile());
  }
  assert.ok((await stat(path.join(directory, 'AI产品经理作品集.docx'))).size > 100_000);
  assert.doesNotMatch(document, /backup\.private|storage\/v1\/object\/sign|sb_secret_/);
});
