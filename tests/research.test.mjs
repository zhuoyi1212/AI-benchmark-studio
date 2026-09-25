import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const [migration, rerunMigration, neutralMigration, repository, service, page, action, actionComponent, taskService, schema, config, quickPreparation, protocolAction] = await Promise.all([
  read("supabase/migrations/202608170005_research_run_lifecycle.sql"),
  read("supabase/migrations/20260926090000_allow_research_rerun_from_downstream.sql"),
  read("supabase/migrations/202608170006_provider_neutral_research_completion.sql"),
  read("lib/repositories/research.repository.ts"),
  read("lib/services/research.service.ts"),
  read("app/projects/[projectId]/research/page.tsx"),
  read("app/projects/[projectId]/research/actions.ts"),
  read("app/projects/[projectId]/research/research-action.tsx"),
  read("lib/ai/task-service.ts"),
  read("lib/ai/schemas/research.schemas.ts"),
  read("lib/ai/config.ts"),
  read("lib/services/quick-project-preparation.service.ts"),
  read("app/projects/[projectId]/protocol/actions.ts"),
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
  assert.match(taskService, /isPreferredOfficialSource \|\| sourceMentionsProduct/);
  assert.match(taskService, /officialSearchSourceRequired/);
  assert.match(taskService, /buildSubmittedOfficialSources/);
  assert.match(taskService, /fetchOfficialPage/);
  assert.match(taskService, /assertPublicHostname/);
  assert.match(taskService, /extractOfficialPageContent/);
  assert.match(taskService, /仅用于确认产品身份和官网地址，不得单独用于证明产品功能、价格或能力/);
  assert.match(taskService, /\.\.\.submittedOfficialSources/);
  assert.match(service, /`"\$\{product\.name\}"`/);
  assert.match(taskService, /sourceMentionsProduct/);
  assert.match(taskService, /interleaveUniqueSources/);
  assert.match(taskService, /insufficientRelevantSearchSources/);
  assert.match(schema, /Positioning must contain traceable product facts/);
  assert.match(service, /价格、免费方案和套餐结论只有在给定来源中存在官方定价或官方帮助页面时才可填写/);
  assert.match(service, /二手来源只能补充官方资料未覆盖的体验或背景/);
  assert.match(service, /Single-product research must list at least one testable core capability/);
  assert.match(service, /schema: validatedComparabilitySchema/);
  assert.match(config, /research-search\.v3/);
  assert.match(config, /research-synthesis\.v6/);
  assert.match(config, /comparability\.v2/);
  assert.match(taskService, /verifiedResearchSchema/);
  assert.match(taskService, /Source URL must exactly reference one of the retrieved sources/);
  assert.match(service, /allowedSourceUrls: product\.officialUrl/);
  assert.match(taskService, /officialSources\.length >= 3 \? officialSources : relevantSources/);
});

test("allows a new versioned ResearchRun after downstream work exists", () => {
  assert.match(rerunMigration, /create or replace function public\.begin_product_research/);
  assert.match(rerunMigration, /where id = p_project_id\s+and deleted_at is null\s+for update/);
  assert.match(rerunMigration, /status in \('pending', 'running'\)/);
  assert.match(rerunMigration, /set status = 'researching'/);
  assert.doesNotMatch(rerunMigration, /status in \('draft', 'researching', 'research_ready'\)/);
});

test("research placeholder guard does not reject normal product descriptions containing uncertainty words", async () => {
  const { isUnresolvedResearchPlaceholder } = await import("../lib/ai/schemas/research.schemas.ts");

  assert.equal(isUnresolvedResearchPlaceholder("秘塔AI搜索是一款面向普通用户的搜索工具，回答中没有广告信息。"), false);
  assert.equal(isUnresolvedResearchPlaceholder("该产品提供搜索与信息整理能力，但官网没有提供明确的套餐价格。"), false);
  assert.equal(isUnresolvedResearchPlaceholder("无法从现有来源确认产品定位。"), true);
  assert.equal(isUnresolvedResearchPlaceholder("未找到相关信息。"), true);
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
  assert.match(action, /resumeQuickProjectPreparation/);
  assert.match(quickPreparation, /project\.status === "research_ready"/);
  assert.match(quickPreparation, /\["idle", "failed"\]\.includes/);
  assert.match(protocolAction, /resumeQuickProjectPreparation/);
  assert.doesNotMatch(page + action + service + repository, /@\/lib\/mock|mockResearchResponse|\/projects\/demo/);
});
