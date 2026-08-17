import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const [action, newProjectPage, projectForm, projectList, researchPage, repository, service] = await Promise.all([
  read("app/projects/new/actions.ts"),
  read("app/projects/new/page.tsx"),
  read("app/projects/new/project-form.tsx"),
  read("app/projects/page.tsx"),
  read("app/projects/[projectId]/research/page.tsx"),
  read("lib/repositories/projects.repository.ts"),
  read("lib/services/projects.service.ts"),
]);

test("creates projects through a validated server action and redirects by real id", () => {
  assert.match(action, /^"use server";/);
  assert.match(action, /z\.array[\s\S]*\.min\(1[\s\S]*\.max\(3/);
  assert.match(action, /createProject\(/);
  assert.match(action, /redirect\(`\/projects\/\$\{projectId\}\/research`\)/);
  assert.doesNotMatch(action, /demo|mock/i);
  assert.match(repository, /\.rpc\("create_benchmark_project"/);
});

test("new project UI submits named product inputs without mock navigation", () => {
  assert.match(projectForm, /name="productName"/);
  assert.match(projectForm, /name="productWebsite"/);
  assert.match(projectForm, /useActionState\(createProjectAction/);
  assert.doesNotMatch(newProjectPage + projectForm, /getNewProjectDraft|\/projects\/demo|setTimeout/);
});

test("project list and research workspace read persisted service data", () => {
  assert.match(projectList, /await listProjectSummaries\(\)/);
  assert.match(projectList, /await connection\(\)/);
  assert.match(researchPage, /await getResearchWorkspace\(projectId\)/);
  assert.match(service, /listProductRows/);
  assert.match(service, /listProgressRows/);
  assert.doesNotMatch(projectList + researchPage, /@\/lib\/mock|"demo"/);
});
