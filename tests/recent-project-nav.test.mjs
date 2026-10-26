import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const createLoader = require('../scripts/lib/load-typescript.cjs');
const root = fileURLToPath(new URL('..', import.meta.url));

async function renderNav(projects, { readOnly = false, failure = false } = {}) {
  const load = createLoader(root, {
    'next/server': { connection: async () => {} },
    '@/components/navigation-link': { NavigationLink: props => React.createElement('a', props) },
    '@/components/workspace-access': { AdminOnly: ({ children }) => readOnly ? null : children },
    '@/lib/services/projects.service': {
      listProjectSummaries: async (...args) => {
        assert.equal(args.length, 0, 'sidebar must not limit the real project list');
        if (failure) throw new Error('offline');
        return projects;
      },
    },
  });
  return renderToStaticMarkup(await load('@/components/recent-project-nav').RecentProjectNav());
}

const project = (id, status = 'testing', mode = 'quick') => ({ id, name: `项目 ${id}`, status, evaluationMode: mode, progress: { percent: 100 } });

test('sidebar renders every project in service chronological order with correct destinations and progress', async () => {
  const projects = [project('newest'), project('report', 'reported', 'professional'), ...Array.from({ length: 8 }, (_, i) => project(`older-${i}`))];
  const html = await renderNav(projects);
  assert.equal((html.match(/<a /g) ?? []).length, projects.length);
  let previous = -1;
  for (const p of projects) {
    const index = html.indexOf(`title="${p.name}"`);
    assert.ok(index > previous, `${p.name} must retain service order`);
    previous = index;
  }
  assert.match(html, /href="\/projects\/newest\/quick"/);
  assert.match(html, /href="\/projects\/report\/report"/);
  assert.equal((html.match(/100%/g) ?? []).length, projects.length);
  assert.match(html, /aria-label="最近项目"/);
});

test('public visitors can browse all projects, but only admins get a create link for an empty workspace', async () => {
  assert.equal((await renderNav([project('one'), project('two')], { readOnly: true })).match(/<a /g).length, 2);
  assert.match(await renderNav([]), /创建第一个测评/);
  assert.equal(await renderNav([], { readOnly: true }), '');
  assert.match(await renderNav([], { failure: true }), /项目列表暂不可用/);
});

test('active projects are ordered by creation time rather than changes to older projects', async () => {
  const rows = [
    { id: 'old-edited', created_at: '2026-10-01', updated_at: '2026-10-20' },
    { id: 'new', created_at: '2026-10-14', updated_at: '2026-10-14' },
  ];
  let ordering;
  const query = {
    select() { return query; }, is() { return query; },
    order(column, options) { ordering = { column, options }; return query; },
    then(resolve) {
      const { column, options: { ascending } } = ordering;
      return Promise.resolve({ data: rows.toSorted((a, b) => ascending ? a[column].localeCompare(b[column]) : b[column].localeCompare(a[column])), error: null }).then(resolve);
    },
  };
  const load = createLoader(root, { '@/lib/supabase/server': { getSupabaseServerClient: () => ({ from: () => query }) } });
  const result = await load('@/lib/repositories/projects.repository').projectsRepository.listActive();
  assert.deepEqual(result.map(row => row.id), ['new', 'old-edited']);
});

test('long project lists have a scrolling region while footer and navigation remain visible', async () => {
  const shell = await readFile(new URL('../components/app-shell.tsx', import.meta.url), 'utf8');
  assert.match(shell, /className="min-h-0 flex-1 overflow-y-auto pb-3"/);
  assert.match(shell, /className="mt-auto shrink-0 border-t pt-3"/);
});
