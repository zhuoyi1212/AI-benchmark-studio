import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { compileProjectArticles } from '../scripts/project-article-compilation.mjs';

function fixture() {
  const projects = ['real', 'empty', 'deleted', 'internal'].map((id, i) => ({ id, name: id === 'internal' ? '[E2E] hidden' : id, deleted_at: id === 'deleted' ? '2026-01-02' : null, created_at: `2026-01-0${i+1}`, intent: '原始意图', evaluation_mode: 'quick' }));
  const post = { title: '原始标题', body: '第一段\n\n第二段 1000 块。', tags: ['原始标签'], interactionQuestion: '' };
  const publish_packs = [1, 2, 3].map(version => ({ id: `p${version}`, project_id: 'real', version, status: 'ready', created_at: `2026-01-0${version}`, community_post: structuredClone(post) }));
  publish_packs[1].community_post.title = '只改标题';
  publish_packs[2].community_post.manualEdit = { aiReviewed: false };
  publish_packs.push(...['deleted', 'internal'].map(id => ({ id: `p-${id}`, project_id: id, version: 1, status: 'ready', created_at: '2026-01-01', community_post: post })));
  return { capturedAt: '2026-10-17T05:35:00Z', tables: { projects, publish_packs, project_products: [], products: [], protocols: [], test_cases: [], test_runs: [{ id: 'run', project_id: 'real' }], test_artifacts: [{ id: 'image', test_run_id: 'run', file_name: '原图.png', kind: 'image' }], experience_findings: [], publish_pack_artifacts: [{ publish_pack_id: 'p3', artifact_id: 'image', display_order: 1, supports_paragraph: 3, reason: '原始说明' }] } };
}

test('compilation retains every text version and raw copy while deduplicating only identical full copies', () => {
  const source = fixture();
  const output = compileProjectArticles(source);
  assert.equal(output.totals.projects, 1);
  assert.equal(output.totals.articleVersions, 3);
  assert.equal(output.totals.uniqueContents, 2);
  const p = output.projects[0];
  assert.deepEqual(p.articles.map(a => a.version), [3, 2, 1]);
  assert.equal(p.articles[0].body, source.tables.publish_packs[2].community_post.body);
  assert.equal(p.articles[0].manualEdit, true);
  assert.equal(p.articles[0].aiReviewed, false);
  assert.equal(p.articles[0].isLatestReady, true);
  assert.deepEqual(p.articles[0].evidence.map(e => [e.order, e.supportsParagraph]), [[1, 3]]);
  assert.ok(p.contentGroups.some(g => g.versions.includes(3) && g.versions.includes(1)));
});

test('saved incomplete copy is retained and labelled without superseding the latest ready version', () => {
  const s = fixture();
  s.tables.publish_packs[2].status = 'failed';
  const output = compileProjectArticles(s);
  assert.equal(output.totals.articleVersions, 3);
  assert.equal(output.totals.readyVersions, 2);
  assert.equal(output.projects[0].articles.find(a => a.isLatestReady).version, 2);
  assert.equal(output.projects[0].articles[0].status, 'failed');
});

test('compilation rejects cross-project image relationships and omits private payloads', () => {
  const s = fixture();
  s.tables.publish_packs[0].community_post.generationTrace = { privateInput: 'do not export' };
  s.tables.projects[0].owner_id = 'private-owner';
  assert.doesNotMatch(JSON.stringify(compileProjectArticles(s)), /privateInput|private-owner|generationTrace/);
  s.tables.publish_pack_artifacts[0].artifact_id = 'foreign-artifact';
  assert.throws(() => compileProjectArticles(s), /outside project/);
});

test('actual compilation counts match all project versions and retain the known latest article records', async () => {
  const markdown = await readFile(new URL('../docs/project-articles/已测评项目与文章汇编.md', import.meta.url), 'utf8');
  assert.doesNotMatch(markdown, /\r/);
  const data = JSON.parse(await readFile(new URL('../docs/project-articles/项目与文章汇编数据.json', import.meta.url), 'utf8'));
  const articles = data.projects.flatMap(p => p.articles);
  assert.equal(articles.length, data.totals.articleVersions);
  assert.equal(new Set(articles.map(a => a.id)).size, articles.length);
  for (const p of data.projects) assert.equal(p.articles.filter(a => a.isLatestReady).length, 1);
  for (const id of ['9182ba30-bc3d-449b-8d26-ac54adb66706', 'ac9f3921-f561-4c35-930a-abc88b6d2277', 'b1fdd8ff-8881-4a65-8e73-d315e3937229']) {
    assert.ok(articles.some(a => a.id === id && a.isLatestReady));
  }
  assert.equal(data.totals.manualVersions, articles.filter(a => a.manualEdit).length);
  assert.doesNotMatch(JSON.stringify(data), /storage\/v1\/object\/sign|sb_secret_|lease_token|input_snapshot/);
});
