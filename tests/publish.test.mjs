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
  assert.match(editor, /没有截图证据，文章仍会使用已保存的测试发现与文本证据/);
  assert.match(editor, /readOnly=\{maxImages === 0\}/);
});
test("plans community content, applies a selected style, and fact-checks the final post", () => {
  assert.match(schema, /stylePreset/);
  assert.match(schema, /structure/);
  assert.match(schema, /editorialPlanSchema/);
  assert.match(schema, /factCheckSchema/);
  assert.match(service, /CommunityPostDraft/);
  assert.match(service, /EvidenceCheckedCommunityPost/);
  assert.match(service, /逐句事实核验/);
  assert.match(service, /评分不是社区文章主线/);
  assert.match(service, /好用 \/ 一般 \/ 难用/);
  assert.match(editor, /写作风格/);
  assert.match(editor, /文章结构/);
});

test("keeps community writing grounded in test evidence instead of score-first summaries", () => {
  assert.match(service, /judgeEvidence: buildJudgeEvidence\(source\)/);
  assert.match(service, /humanReview: source\.report\.review/);
  assert.match(service, /Final Score 仅可作为辅助背景/);
  assert.match(service, /Research 只提供背景/);
  assert.match(service, /不得创造体验、数据、竞品对比或未测试能力/);
  assert.match(service, /将过度概括改成证据实际覆盖的范围/);
  assert.match(service, /缺少过程日志只能写本次未留存/);
  assert.match(service, /evidenceGroundedPostSchema/);
  assert.match(service, /atLeastThreeEvidenceGroundedIdeas/);
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

test("requires editorial planning and fact-check metadata for new generations while preserving historical posts", async () => {
  const { communityPostGenerationSchema, communityPostOutputSchema } = await import("../lib/ai/schemas/publish.schemas.ts");
  const post = { title: "测试结果", body: "本次回答提供了文献列表。".repeat(30), tags: ["测评"], interactionQuestion: "你如何核验引用？", screenshotRecommendations: [] };
  assert.equal(communityPostOutputSchema.safeParse(post).success, true);
  const metadata = {
    editorialPlan: { coreConclusion: "有明确优点，也有具体限制。", highlights: ["优点有真实证据"], neutralPoints: [], painPoints: ["限制有真实证据"], structure: ["结论", "好用", "问题", "个人感受"], avoidClaims: ["不扩大到未测试场景"] },
    factCheck: { status: "passed", revisedClaimCount: 0, notes: [] },
  };
  const incomplete = communityPostGenerationSchema.safeParse({ ...post, ...metadata });
  assert.equal(incomplete.success, false);
  assert.deepEqual(incomplete.error.issues[0].path, ["body"]);
  assert.match(incomplete.error.issues[0].message, /complete article/);
  const body = ["任务：检索学术综述并列出来源。", "回答：给出了论文链接和方法比较。", "核验：部分文献发表状态不完整。", "范围：仅核查本次回答，不推断其他功能。"].map(p => p.repeat(5)).join("\n\n");
  assert.equal(communityPostGenerationSchema.safeParse({ ...post, ...metadata, body }).success, true);
  assert.match(service, /const evidenceGroundedPostSchema = communityPostGenerationSchema/);
});
