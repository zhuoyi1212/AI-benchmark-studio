import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
async function read(path) { return readFile(new URL(`../${path}`, import.meta.url), "utf8"); }
const [migration, lineageMigration, textOnlyMigration, schema, repository, service, page, editor, actions] = await Promise.all([
  read("supabase/migrations/202608170015_publish_pack_lifecycle.sql"),
  read("supabase/migrations/202608170016_publish_pack_discovery_lineage.sql"),
  read("supabase/migrations/20260824090000_allow_text_only_publish_packs.sql"), read("lib/ai/schemas/publish.schemas.ts"),
  read("lib/repositories/publish.repository.ts"), read("lib/services/publish.service.ts"),
  read("app/projects/[projectId]/publish/page.tsx"), read("app/projects/[projectId]/publish/publish-editor.tsx"), read("app/projects/[projectId]/publish/actions.ts"),
]);
test("separates Content Discovery and Community Post AI runs", () => {
  assert.match(migration, /start_content_discovery/); assert.match(migration, /complete_content_discovery/);
  assert.match(migration, /start_community_post/); assert.match(migration, /complete_publish_pack/);
  assert.match(migration, /discovery_provider/); assert.match(migration, /generation_started_at/);
  assert.match(service, /aiTaskService\.discoverContentIdeas/); assert.match(service, /aiTaskService\.generateCommunityPost/);
  assert.doesNotMatch(service + page + editor + actions, /glm-|deepseek-v|provider:\s*["']/);
});
test("keeps dynamic ContentIdeas and real rediscovery", () => {
  assert.match(schema, /ideas: z\.array\(contentIdeaSchema\)\.min\(1\)\.max\(6\)/);
  assert.match(schema, /Content Idea contains an internal identifier/);
  assert.match(schema, /internalIdentifierPattern\.test\(publicCopy\)/);
  assert.doesNotMatch(service, /humanOverrideReason:/);
  assert.match(service, /humanReviewAdjustment:/);
  assert.match(service, /uniqueIdeasAndSingleRecommendation/); assert.match(editor, /重新发现选题/);
  assert.doesNotMatch(service + page + editor + actions, /createMockContentIdeas|mockCommunityPost|@\/lib\/mock/);
});
test("persists selected or custom angle and validated publish config", () => {
  assert.match(schema, /id: z\.literal\("custom"\)/); assert.match(schema, /imageCount: z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.max\(9\)/);
  assert.match(migration, /Selected ContentIdea does not belong/); assert.match(editor, /自定义内容角度/);
});
test("only recommends and persists real image TestArtifacts", () => {
  assert.match(service, /mimeType\.startsWith\("image\/"\)/); assert.match(service, /orderedRealScreenshotReferences/);
  assert.match(migration, /publish_pack_artifacts/); assert.match(migration, /\(recommendation->>'artifactId'\)::uuid/);
  assert.match(editor, /测试截图库/); assert.match(editor, /下载全部图片/); assert.match(editor, /复制帖子内容/);
  assert.doesNotMatch(service + editor, /AI 生图|mock:\/\//);
});
test("allows evidence-backed text-only posts without fabricated screenshots", () => {
  assert.match(schema, /screenshotRecommendations: z\.array\(screenshotRecommendationSchema\)\.max\(9\)/);
  assert.match(service, /withAvailableImageCount/);
  assert.doesNotMatch(service, /没有可用的原始截图，不能生成/);
  assert.match(service, /没有图片时 screenshotRecommendations 必须返回空数组/);
  assert.match(textOnlyMigration, /imageCount'\)::integer not between 0 and 9/);
  assert.match(textOnlyMigration, /jsonb_array_length\(p_recommendations\) not between 0 and 9/);
  assert.doesNotMatch(textOnlyMigration, /must retain at least one screenshot/);
  assert.match(editor, /没有截图证据，文章仍会使用 Judge 与 Report 中的真实文本证据/);
  assert.match(editor, /readOnly=\{maxImages === 0\}/);
});
test("gives article generation direct Judge and Human Review evidence with a minimum publishable structure", () => {
  assert.match(service, /judgeEvidence: buildJudgeEvidence\(source\)/);
  assert.match(service, /humanReview: source\.report\.review/);
  assert.match(service, /正文至少 4 段/);
  assert.match(service, /post\.body\.trim\(\)\.length < 200/);
  assert.match(service, /publishableEvidenceArticleStructure/);
  assert.match(service, /不得把由不适用 Rubric、输入缺失或执行环境造成的低分直接归因于产品能力/);
  assert.match(service, /没有可验证逐字来源时，不得使用引号声称某句话是官方宣传语/);
  assert.match(service, /二手来源中的价格或套餐不要写入正文/);
  assert.match(service, /不得据此推断产品未调用工具、默认行为或能力不足/);
  assert.match(service, /atLeastThreeEvidenceGroundedIdeas/);
  assert.match(service, /evidenceGroundedPostSchema/);
  assert.match(service, /可能通过隐式代理/);
  assert.match(service, /本项目评分不得称为‘官方测评’/);
  assert.match(service, /Skill 生态、协作能力或透明度是产品短板/);
  assert.match(service, /缺少工具日志只能表述为‘本次证据未提供’，不得推断产品默认行为/);
  assert.match(service, /不得要求或声称展示私有思维链、内部决策链/);
  assert.match(service, /优先把“实际 Case 表现与汇总分差异”作为方法学发现/);
});
test("guards Publish by current completed Report and exposes explicit states", () => {
  assert.match(migration, /PublishPack requires a current completed Report/); assert.match(migration, /private\.final_score_signature/);
  assert.match(page, /redirect\(`\/projects\/\$\{projectId\}\/report`\)/); assert.match(editor, /上次内容发现未完成/); assert.match(editor, /正在从完整实验中发现观点/);
});
test("keeps Publish mutations service-role only and ready evidence immutable", () => {
  assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated/); assert.match(migration, /grant execute[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /grant execute[\s\S]*to (?:anon|authenticated)/); assert.doesNotMatch(migration, /on delete cascade/i);
});
test("preserves Content Discovery provenance across Community Post retries", () => {
  assert.match(lineageMigration, /discovery_pack\.discovery_provider/);
  assert.match(lineageMigration, /discovery_pack\.discovery_prompt_version/);
  assert.match(lineageMigration, /candidate\.discovered_at is not null/);
  assert.match(lineageMigration, /grant execute[\s\S]*to service_role/);
});
