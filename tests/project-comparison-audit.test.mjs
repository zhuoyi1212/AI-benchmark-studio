import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const base = 'docs/audits/2026-10-23-seven-project-comparison';
const audit = JSON.parse(await readFile(new URL(`${base}.json`, root), 'utf8'));
const report = await readFile(new URL(`${base}.md`, root), 'utf8');

test('comparison audit covers the seven requested projects and all eight route reads per project', () => {
  assert.equal(audit.projects.length, 7);
  assert.equal(new Set(audit.projects.map(p => p.id)).size, 7);
  assert.equal(audit.projects.filter(p => p.group === 'recent_ai').length, 3);
  assert.equal(audit.projects.filter(p => p.group === 'earlier_human_assisted').length, 4);
  assert.equal(audit.totals.pageReads, 56);
  for (const p of audit.projects) {
    assert.ok(report.toLowerCase().includes(p.name.split('｜')[0].toLowerCase()), `missing project ${p.name}`);
    assert.equal(p.routes.length, 8);
    assert.deepEqual(p.routes.map(r => r.route).sort(), ['protocol', 'publish', 'quick', 'report', 'research', 'results', 'review', 'test']);
    assert.ok(p.routes.every(r => r.status === 200));
    assert.equal(p.evaluationMode, 'quick');
    assert.equal(p.article.sourceType, 'findings');
    assert.ok(p.article.generationTrace.some(t => t.stage === 'writing' && t.model === 'kimi-k3'));
  }
  assert.equal(audit.projects.reduce((n, p) => n + p.article.retainedVersions.length, 0), audit.totals.publishPacks);
});

test('audit separates data-dependent evidence badges, manual revisions and legacy routing failures', () => {
  const recent = audit.projects.filter(p => p.group === 'recent_ai');
  const older = audit.projects.filter(p => p.group === 'earlier_human_assisted');
  assert.ok(recent.every(p => p.article.manualEdit?.aiReviewed === false));
  assert.ok(older.every(p => p.article.manualEdit === null));
  const withImages = audit.projects.filter(p => p.article.selectedImages.length);
  assert.equal(withImages.length, 1);
  assert.equal(withImages[0].id, '77ac52ae-cb4c-477b-9783-688dead41c12');
  assert.deepEqual(withImages[0].article.selectedImages.map(i => i.visibleParagraph), [3, 2]);
  assert.match(withImages[0].article.selectedIdeaTitle, /水印/);
  assert.doesNotMatch(withImages[0].article.title, /水印/);
  assert.match(report, /D34.*新正文与旧选题仍不一致/);
  const errors = audit.projects.flatMap(p => p.routes.filter(r => r.streamErrorDigests.length).map(r => ({ p, r })));
  assert.equal(errors.length, 2, 'HTTP 200 must not conceal the two recorded streamed report failures');
  assert.ok(errors.every(({ p, r }) => p.group === 'earlier_human_assisted' && r.route === 'report' && p.reviewSessions === 0));
  for (const { p } of errors) {
    assert.ok(p.routes.find(r => r.route === 'results').redirects.some(path => path.endsWith('/review')));
    assert.ok(p.routes.find(r => r.route === 'quick').headings.includes('测试执行'));
  }
  assert.equal(audit.projects.filter(p => p.reportHiddenFromVisitors).length, 2);
  assert.equal(audit.totals.humanReviewEvents, 1);
  assert.match(report, /7→7/);
  assert.match(report, /updated_at.*未变化/);
  assert.match(report, /本轮仅交付差异清单与证据，没有执行以上修复/);
});

test('audit cites existing implementation and history while keeping private runtime captures out of the public summary', async () => {
  for (const path of [
    'app/projects/[projectId]/publish/publish-editor.tsx',
    'app/projects/[projectId]/results/page.tsx',
    'app/projects/[projectId]/quick/page.tsx',
    'lib/services/publish.service.ts', 'lib/community-post-formatter.ts',
    'lib/workflow-navigation-state.ts', 'lib/portfolio-visibility.ts',
    'lib/compliance-baseline.ts', 'lib/ai/config.ts',
    'supabase/migrations/20260920072407_quick_findings_flow.sql',
    'docs/regeneration-reliability-20261016.md',
    'docs/project-articles/已测评项目与文章汇编.md',
  ]) {
    await access(new URL(path, root));
    assert.ok(report.includes(path), `report must cite ${path}`);
  }
  assert.doesNotMatch(JSON.stringify(audit), /storage\/v1\/object\/sign|lease_token|actor_id|input_snapshot/);
  assert.match(report, /快照之后的变化/);
  assert.match(report, /数据库没有独立的执行者类型字段/);
});
