import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const mainFlowFiles = [
  ...(await sourceFiles("app/projects/[projectId]")),
  ...(await sourceFiles("lib/services")),
  ...(await sourceFiles("lib/repositories")),
  "components/app-shell.tsx",
  "components/recent-project-nav.tsx",
  "components/workflow-steps.tsx",
];
const mainFlowSource = (await Promise.all(mainFlowFiles.map(async (path) => `// ${path}\n${await readFile(new URL(path, root), "utf8")}`))).join("\n");

test("keeps Mock modules outside every real project route and business service", () => {
  assert.doesNotMatch(mainFlowSource, /@\/lib\/mock|lib\/mock/);
  for (const fixtureName of ["mockResearchResponse", "mockProtocol", "mockJudgeResults", "mockFinalResultAnalysis", "mockBenchmarkReport", "mockCommunityPost"]) {
    assert.equal(mainFlowSource.includes(fixtureName), false, `${fixtureName} leaked into the real main flow`);
  }
});

test("renders the recent project from the real Project service", () => {
  assert.match(mainFlowSource, /listProjectSummaries\(\{ limit: 1 \}\)/);
  assert.match(mainFlowSource, /getProjectHref\(project\.id, project\.status\)/);
  assert.doesNotMatch(mainFlowSource, /Mock workspace|前端演示模式|\/projects\/demo\/test/);
});

test("derives workflow links from the current real route without a demo fallback", () => {
  assert.match(mainFlowSource, /pathname\.match\(\/\^\\\/projects/);
  assert.doesNotMatch(mainFlowSource, /params\.projectId \?\? "demo"|resolvedProjectId[^\n]+"demo"/);
});

async function sourceFiles(relativePath) {
  const entries = await readdir(new URL(`${relativePath}/`, root), { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = `${relativePath}/${entry.name}`;
    return entry.isDirectory() ? sourceFiles(path) : /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  }));
  return files.flat();
}
