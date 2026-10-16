import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const documentPath = path.join(root, 'docs/AI-Benchmark-Studio-作品集证据盘点.md');
const document = await readFile(documentPath, 'utf8');
const indexStart = document.indexOf('## 11. 证据索引');
const index = document.slice(indexStart);

test('portfolio evidence references resolve to indexed, versioned repository sources', async () => {
  assert.ok(indexStart >= 0, 'evidence index must exist');
  const rows = [...index.matchAll(/^\| (E\d+) \|/gm)].map(match => match[1]);
  assert.equal(new Set(rows).size, rows.length, 'evidence IDs must be unique');
  for (const [, id] of document.slice(0, indexStart).matchAll(/\b(E\d+)\b/g)) {
    assert.ok(rows.includes(id), `unresolved evidence ID: ${id}`);
  }
  const links = [...index.matchAll(/\]\(([^)]+)\)/g)].map(match => match[1]);
  assert.ok(links.length > 0, 'source links must exist');
  const tracked = new Set(execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0'));
  for (const link of links) {
    const absolute = path.resolve(path.dirname(documentPath), link);
    const relative = path.relative(root, absolute);
    assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative), `source escapes repository: ${link}`);
    assert.ok(tracked.has(relative), `evidence must be versioned, not a temporary output: ${link}`);
    assert.ok((await stat(absolute)).isFile(), `source is not a file: ${link}`);
  }
});

test('portfolio case implementation commits resolve in repository history', () => {
  const caseCommits = document.slice(document.indexOf('已核对的案例提交：'));
  const commits = [...caseCommits.matchAll(/`([0-9a-f]{7})`/g)].map(match => match[1]);
  assert.ok(commits.length > 0, 'case commits must be present');
  for (const commit of commits) {
    execFileSync('git', ['cat-file', '-e', `${commit}^{commit}`], { cwd: root, stdio: 'pipe' });
  }
});
