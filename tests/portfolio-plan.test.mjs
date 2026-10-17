import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { storyReviewSchema } from '../lib/ai/schemas/publish.schemas.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, 'docs/portfolio');
const names = ['作品集完整方案.md', '节点设计与评测标准.md', '模型选型与效果评估方案.md'];
const documents = await Promise.all(names.map(name => readFile(path.join(directory, name), 'utf8')));
const [overview, nodes] = documents;

test('portfolio design covers every workflow node with interfaces, gates, evaluation and recovery', () => {
  const cards = [...nodes.matchAll(/^## (N\d{2}) ([^\n]+)\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)];
  const expected = Array.from({ length: 15 }, (_, i) => `N${String(i).padStart(2, '0')}`);
  assert.deepEqual(cards.map(card => card[1]), expected);
  for (const [, id, , body] of cards) {
    assert.ok(overview.includes(id), `${id} missing from overview`);
    for (const field of ['AI任务', '目标', '输入', '输出', '验收', '评测', '异常', '现状']) {
      assert.ok(body.includes(`**${field}：**`), `${id} missing ${field}`);
    }
  }
});

test('portfolio local evidence and cross-document anchors resolve', async () => {
  for (let i = 0; i < documents.length; i++) {
    const links = [...documents[i].matchAll(/\]\(([^)]+)\)/g)].map(match => match[1]);
    for (const link of links) {
      if (/^https?:\/\//.test(link)) continue;
      const [filePart, anchor] = link.split('#');
      const absolute = path.resolve(directory, filePart || names[i]);
      const relative = path.relative(root, absolute);
      assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative), `source escapes workspace: ${link}`);
      assert.ok((await stat(absolute)).isFile(), `missing evidence: ${link}`);
      if (anchor) {
        const contents = await readFile(absolute, 'utf8');
        const anchors = [...contents.matchAll(/^#+ (.+)$/gm)].map(match => match[1]
          .toLowerCase().replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/\s/g, '-'));
        assert.ok(anchors.includes(decodeURIComponent(anchor)), `missing anchor: ${link}`);
      }
    }
  }
});

test('documented AI task routes exist in the current central configuration', async () => {
  const config = await readFile(path.join(root, 'lib/ai/config.ts'), 'utf8');
  const taskLines = [...nodes.matchAll(/^- \*\*AI任务：\*\*(.+)$/gm)];
  for (const [, line] of taskLines) {
    for (const [, task] of line.matchAll(/`([a-z_]+)`/g)) {
      assert.match(config, new RegExp(`\\b${task}:\\s*\\{`), `unknown route: ${task}`);
    }
  }
});

test('portfolio distinguishes current candidate count and review flag from proposed metrics', async () => {
  const schema = await readFile(path.join(root, 'lib/ai/schemas/publish.schemas.ts'), 'utf8');
  const bounds = schema.match(/ideas: z\.array\(contentIdeaSchema\)\.min\((\d+)\)\.max\((\d+)\)/);
  assert.ok(bounds, 'candidate count schema changed; review documentation');
  assert.ok(nodes.includes(`${bounds[1]}–${bounds[2]}个候选`));
  const review = await readFile(path.join(root, 'lib/services/human-review.service.ts'), 'utf8');
  const threshold = review.match(/score\.confidence < ([\d.]+)/);
  assert.ok(threshold);
  assert.ok(nodes.includes(`confidence<${threshold[1]}`));
  assert.match(documents[2], /结果待完成/);
  assert.match(documents[2], /分母为0/);
});

test('illustrative review output conforms to the actual production schema', () => {
  const example = nodes.match(/```json\n([\s\S]+?)\n```/);
  assert.ok(example);
  const review = storyReviewSchema.parse(JSON.parse(example[1]));
  assert.equal(review.articleReview.boundedInterpretation, false);
  assert.ok(review.issues.every(issue => issue.kind === 'fact' && issue.quote));
});
