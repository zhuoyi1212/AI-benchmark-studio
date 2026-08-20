import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
async function read(path) { return readFile(new URL(`../${path}`, import.meta.url), "utf8"); }
const [migration, lineageMigration, schema, repository, service, page, editor, actions] = await Promise.all([
  read("supabase/migrations/202608170015_publish_pack_lifecycle.sql"),
  read("supabase/migrations/202608170016_publish_pack_discovery_lineage.sql"), read("lib/ai/schemas/publish.schemas.ts"),
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
  assert.match(schema, /id: z\.literal\("custom"\)/); assert.match(schema, /imageCount: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(9\)/);
  assert.match(migration, /Selected ContentIdea does not belong/); assert.match(editor, /自定义内容角度/);
});
test("only recommends and persists real image TestArtifacts", () => {
  assert.match(service, /mimeType\.startsWith\("image\/"\)/); assert.match(service, /orderedRealScreenshotReferences/);
  assert.match(migration, /publish_pack_artifacts/); assert.match(migration, /\(recommendation->>'artifactId'\)::uuid/);
  assert.match(editor, /测试截图库/); assert.match(editor, /下载全部图片/); assert.match(editor, /复制帖子内容/);
  assert.doesNotMatch(service + editor, /AI 生图|mock:\/\//);
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
