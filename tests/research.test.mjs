import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const [migration, neutralMigration, repository, service, page, action, actionComponent, taskService] = await Promise.all([
  read("supabase/migrations/202608170005_research_run_lifecycle.sql"),
  read("supabase/migrations/202608170006_provider_neutral_research_completion.sql"),
  read("lib/repositories/research.repository.ts"),
  read("lib/services/research.service.ts"),
  read("app/projects/[projectId]/research/page.tsx"),
  read("app/projects/[projectId]/research/actions.ts"),
  read("app/projects/[projectId]/research/research-action.tsx"),
  read("lib/ai/task-service.ts"),
]);

test("versions ResearchRuns and preserves terminal history", () => {
  assert.match(migration, /create function public\.begin_product_research/);
  assert.match(migration, /coalesce\(max\(version\), 0\) \+ 1/);
  assert.match(migration, /Project already has an active ResearchRun/);
  assert.match(migration, /create function public\.fail_product_research/);
  assert.doesNotMatch(migration, /delete from public\.research_runs/i);
  assert.match(repository, /\.rpc\("begin_product_research"/);
  assert.match(repository, /\.rpc\("fail_product_research"/);
});

test("persists verified ProductResearch before comparability", () => {
  const insertIndex = service.indexOf("insertProductResearch");
  const persistedReadIndex = service.indexOf("listProductResearch(activeRunId)", insertIndex);
  const comparabilityIndex = service.indexOf("evaluateComparability", persistedReadIndex);
  assert.ok(insertIndex > 0 && persistedReadIndex > insertIndex && comparabilityIndex > persistedReadIndex);
  assert.match(service, /sourceUrlsMustReferenceRetrievedSources/);
  assert.match(service, /officialSourceRequired/);
  assert.match(service, /Promise\.all\([\s\S]*project\.products\.map/);
  assert.match(taskService, /Use only these retrieved sources for product facts/);
  assert.match(taskService, /allowedDomains/);
  assert.match(taskService, /isDomainOrSubdomain/);
});

test("records all routed task metadata and completes only a full run", () => {
  assert.match(migration, /search_provider text/);
  assert.match(migration, /comparability_provider text/);
  assert.match(neutralMigration, /provider task ownership remains in the AI Router/);
  assert.doesNotMatch(neutralMigration, /p_search_provider <> 'zhipu'|p_comparability_provider <> 'deepseek'/);
  assert.match(migration, /set status = 'completed'/);
  assert.match(repository, /p_search_prompt_version/);
  assert.match(repository, /p_comparability_prompt_version/);
});

test("real research route exposes failed and retry states without mock fallback", () => {
  assert.match(action, /executeProductResearch/);
  assert.match(page, /ResearchRun v/);
  assert.match(page, /<ResearchAction[\s\S]*retry/);
  assert.match(actionComponent, /重新调研/);
  assert.doesNotMatch(page + action + service + repository, /@\/lib\/mock|mockResearchResponse|\/projects\/demo/);
});
