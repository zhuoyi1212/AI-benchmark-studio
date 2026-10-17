import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const folder = new URL('../docs/project-articles/', import.meta.url);
const load = async () => ({
  report: await readFile(new URL('社区文案诊断与自然表达改进方案.md', folder), 'utf8'),
  data: JSON.parse(await readFile(new URL('项目与文章汇编数据.json', folder), 'utf8')),
});

test('editorial diagnosis cites the actual latest article version and verbatim evidence for every project', async () => {
  const { report, data } = await load();
  const rows = report.split('\n').filter(line => /^\|[^|]+\| v\d+ \| [0-9a-f-]{36} \|/.test(line));
  assert.equal(rows.length, data.projects.length);
  const seen = new Set();
  for (const row of rows) {
    const [, version, id, quote] = row.split('|').slice(1, -1).map(value => value.trim());
    const project = data.projects.find(p => p.articles.some(a => a.id === id));
    assert.ok(project, `Unknown article: ${id}`);
    const article = project.articles.find(a => a.id === id);
    assert.equal(article.isLatestReady, true);
    assert.equal(version, `v${article.version}`);
    assert.ok(article.body.includes(quote), `Quote differs from saved body: ${id}`);
    seen.add(project.id);
  }
  assert.equal(seen.size, data.projects.length);
});

test('diagnosis distinguishes saved interaction patterns from independent model evaluation', async () => {
  const { report, data } = await load();
  const latest = data.projects.map(p => p.articles.find(a => a.isLatestReady));
  const count = predicate => latest.filter(predicate).length;
  assert.ok(report.includes(`${count(a => a.interactionQuestion.trim())}/${latest.length}的独立互动字段非空`));
  assert.ok(report.includes(`${count(a => /[？?]$/.test(a.body.trim()))}/${latest.length}的正文也以问句结束`));
  assert.ok(report.includes(`${count(a => a.title.includes('：'))}/${latest.length}的最新标题使用冒号`));
  const repeated = latest.filter(a => a.interactionQuestion && a.body.includes(a.interactionQuestion));
  assert.equal(repeated.length, 1);
  assert.equal(repeated[0].id, '8b4ef80f-33c9-47bc-a065-a04614355ae4');
  assert.match(report, /不作为23份独立样本/);
  assert.match(report, /自然度判断属于编辑判断/);
  assert.match(report, /未改写App中的文章/);
});
