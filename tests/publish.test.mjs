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
  assert.match(service, /aiTaskService\.discoverContentIdeas/); assert.match(service, /aiTaskService\.generateCommunityPost/); assert.match(service, /aiTaskService\.humanizeCommunityPost/);
  assert.doesNotMatch(service + page + editor + actions, /glm-|deepseek-v|provider:\s*["']/);
});
test("keeps dynamic ContentIdeas and real rediscovery", () => {
  assert.match(schema, /ideas: z\.array\(contentIdeaSchema\)\.min\(1\)\.max\(6\)/);
  assert.match(schema, /Content Idea contains an internal identifier/);
  assert.match(schema, /internalIdentifierPattern\.test\(publicCopy\)/);
  assert.match(service, /UUID 和内部字段标识只能放入对应 ID 数组；严禁复制到 title、type、angle、insight、whyInteresting 或 supportingEvidence/);
  assert.doesNotMatch(service, /humanOverrideReason:/);
  assert.match(service, /humanReviewAdjustment:/);
  assert.match(service, /uniqueIdeasAndSingleRecommendation/); assert.match(editor, /重新提炼发现/);
  assert.doesNotMatch(service + page + editor + actions, /createMockContentIdeas|mockCommunityPost|@\/lib\/mock/);
});
test("persists selected or custom angle and validated publish config", () => {
  assert.match(schema, /id: z\.literal\("custom"\)/); assert.match(schema, /imageCount: z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.max\(9\)/);
  assert.match(migration, /Selected ContentIdea does not belong/); assert.match(editor, /自定义核心观点/);
});
test("keeps a visible publish action beside the selected idea", () => {
  assert.match(editor, /sticky top-4 z-30 mb-5/);
  assert.match(editor, /已选：/);
  assert.match(editor, /<HiddenConfig config=\{config\} \/>/);
  assert.match(editor, /正在生成发布稿/);
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
  assert.match(service, /没有图片时必须返回空数组/);
  assert.match(textOnlyMigration, /imageCount'\)::integer not between 0 and 9/);
  assert.match(textOnlyMigration, /jsonb_array_length\(p_recommendations\) not between 0 and 9/);
  assert.doesNotMatch(textOnlyMigration, /must retain at least one screenshot/);
  assert.match(editor, /没有截图证据，文章仍会使用已保存的测试发现与文本证据/);
  assert.match(editor, /readOnly=\{maxImages === 0\}/);
});
test("plans community content, humanizes the draft, and fact-checks the final post", () => {
  assert.match(schema, /stylePreset/);
  assert.match(schema, /structure/);
  assert.match(schema, /contentBriefSchema/);
  assert.match(schema, /languagePassSchema/);
  assert.match(schema, /factCheckSchema/);
  assert.match(service, /CommunityPostDraft/);
  assert.match(service, /HumanizedCommunityPost/);
  assert.match(service, /EvidenceCheckedCommunityPost/);
  assert.match(service, /polishRules/);
  assert.match(service, /contentReviewRules/);
  assert.match(service, /finalAuditRules/);
  assert.match(service, /chooseWritingTemplate/);
  assert.match(editor, /写作风格/);
  assert.match(editor, /文章结构/);
  assert.match(editor, /内容简报/);
  assert.match(editor, /语言优化/);
  assert.doesNotMatch(editor, /信息价值|讨论潜力/);
});

test("keeps community writing grounded in confirmed Findings instead of score-first summaries", () => {
  assert.match(service, /humanConfirmedFindings/);
  assert.match(service, /事实判断以 humanConfirmedFindings 为主/);
  assert.match(service, /不引入排名或数值评分/);
  assert.match(service, /不得创造体验、数据、竞品对比或未测试能力/);
  assert.match(service, /publicationReviewPassed/);
  assert.match(service, /不能从缺少过程记录推断产品行为/);
  assert.match(service, /reviewedPublicationSchema/);
  assert.match(service, /atLeastOneEvidenceGroundedIdea/);
});

test("quick mode cannot fall back to an unconfirmed background report for Publish", () => {
  assert.match(service, /quick\?\.evaluationMode === "quick"/);
  assert.match(service, /return null/);
});
test("enters Publish from confirmed Findings while retaining Report fallback", async () => {
  const quickMigration = await read("supabase/migrations/20260920072407_quick_findings_flow.sql");
  assert.match(quickMigration, /begin_findings_publish_pack/);
  assert.match(quickMigration, /PublishPack requires confirmed Findings/);
  assert.match(repository, /beginFromFindings/);
  assert.match(repository, /beginFromReport/);
  assert.match(service, /getExperienceFindingsWorkspace/);
  assert.match(service, /sourceType: "confirmed_findings"/);
  assert.match(page, /redirect\(\`\/projects\/\$\{projectId\}\/results\`\)/);
  assert.match(editor, /当前来源：人工确认 Findings/);
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

test("refreshes only the title through a new immutable PublishPack version", async () => {
  const titleMigration = await read("supabase/migrations/20261004180420_refresh_publish_pack_title.sql");
  assert.match(titleMigration, /create function public\.refresh_publish_pack_title/);
  assert.match(titleMigration, /Only the latest PublishPack title can be refreshed/);
  assert.match(titleMigration, /insert into public\.publish_packs/);
  assert.match(titleMigration, /insert into public\.publish_pack_artifacts/);
  assert.match(titleMigration, /'titleRefreshes'/);
  assert.match(titleMigration, /revoke all[\s\S]*from public, anon, authenticated/);
  assert.match(titleMigration, /grant execute[\s\S]*to service_role/);
  assert.match(service, /generateCommunityPostTitle/);
  assert.match(service, /publicationTitleIssues/);
  assert.match(repository, /refresh_publish_pack_title/);
  assert.match(actions, /refreshCommunityPostTitle/);
  assert.match(editor, /换一个标题/);
  const { publicationTitleIssues } = await import("../lib/community-content-policy.ts");
  assert.deepEqual(publicationTitleIssues("懂你AI把加薪建议写到了可执行步骤", "正文写明了具体建议。"), []);
  assert.ok(publicationTitleIssues("震惊！3步封神！", "正文没有数字。", "旧标题").length >= 2);
});

test("requires content brief, language pass, and fact-check metadata for new generations while preserving historical posts", async () => {
  const { communityPostGenerationSchema, communityPostOutputSchema } = await import("../lib/ai/schemas/publish.schemas.ts");
  const post = { title: "测试结果", body: "本次回答提供了文献列表。".repeat(30), tags: ["测评"], interactionQuestion: "你如何核验引用？", screenshotRecommendations: [] };
  assert.equal(communityPostOutputSchema.safeParse(post).success, true);
  const metadata = {
    contentBrief: {
      coreViewpoint: "有明确优点，也有具体限制。",
      opening: "先讲最直接的使用感受。",
      supportingPoints: [
        { finding: "优点有真实证据", userMeaning: "用户能更快判断结果是否可用。" },
        { finding: "限制有真实证据", userMeaning: "用户仍需要保留核对步骤。" },
      ],
      ending: "只给当前测试范围内的判断。",
      voice: "第一人称、短句、具体。",
      avoidPhrases: ["总体而言"],
    },
    languagePass: { status: "polished", changedSentenceCount: 3, notes: ["删除报告式连接词"] },
    factCheck: { status: "passed", revisedClaimCount: 0, notes: [] },
  };
  const incomplete = communityPostGenerationSchema.safeParse({ ...post, ...metadata });
  assert.equal(incomplete.success, true); // No paragraph quota: content quality is independently reviewed.
  assert.equal(communityPostGenerationSchema.safeParse(post).success, false);
  const body = ["任务：检索学术综述并列出来源。", "回答：给出了论文链接和方法比较。", "核验：部分文献发表状态不完整。", "范围：仅核查本次回答，不推断其他功能。"].map(p => p.repeat(5)).join("\n\n");
  assert.equal(communityPostGenerationSchema.safeParse({ ...post, ...metadata, body }).success, true);
  assert.match(service, /publicationCopyIssues/);
});
