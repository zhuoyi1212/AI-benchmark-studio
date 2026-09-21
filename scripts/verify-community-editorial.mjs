// Runs the real planning → writing → fact-check service against SYNTHETIC text evidence.
// No database access, no screenshot creation, no production PublishPack writes.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import createLoader from './lib/load-typescript.cjs';
import { sceneFindings, dimensionFindings, productId, testCaseId, artifactId } from '../tests/fixtures/community-editorial.mjs';

if (!process.argv.includes('--live')) throw new Error('Opt in to real provider calls with --live; this uses configured AI credentials and synthetic evidence only.');
const root = fileURLToPath(new URL('..', import.meta.url));
const dimension = process.argv.includes('--dimensions');
const findings = dimension ? dimensionFindings : sceneFindings;
const mode = dimension ? '多维度测评' : '场景深度测评';
const idea = { id: 'idea-style-probe', title: '哪些镜头可以留下', type: '创作体验', angle: '镜头能否直接接进成片', insight: '不同任务的片段有不同的可用边界', whyInteresting: '细节影响实际剪辑', supportingEvidence: findings.map(f => f.observation), relatedTestCaseIds: [testCaseId], relatedArtifactIds: [], informationValue: 0.8, discussionPotential: 0.8, confidence: 0.9, recommended: true };
let saved;
const forbid = () => { throw new Error('The style probe must not access production data'); };
const workspace = {
  projectName: '写作验证夹具（虚构素材）', projectIntent: '验证文章组织，不评估真实产品', projectMode: 'single', products: [{ id: productId, name: '视频工具样本' }],
  testCases: [{ id: testCaseId, title: '短片镜头试验', objective: '按给定脚本完成镜头', prompt: dimension ? '生成含桌子、人物、窗户的场景、挥剑动作及远近景切换片段，分别观察空间、动作与服装一致性；只留存本轮结果。' : '分别生成镜前人物、从侧方上台、转身三个片段；仅留存本轮结果，不统计总体成功率。' }],
  protocolId: testCaseId, protocolVersion: 1,
  latest: { id: productId, status: 'completed', humanConfirmedAt: '2026-09-21', effectiveOutput: { summary: '写作验证夹具', findings, limitations: ['仅供生成链路验证，不是真实测评。'] } },
  artifacts: [{ artifactId, productId, testCaseId, fileName: 'fixture.txt', mimeType: 'text/plain', fileUrl: null }],
};
const load = createLoader(root, {
  '@/lib/repositories/publish.repository': { publishRepository: {
    listByFindings: async () => [{ id: productId, status: 'draft', content_ideas: [idea] }],
    startPost: async () => {},
    complete: async (_id, post) => { saved = post; },
    fail: async () => {},
  } },
  '@/lib/repositories/result-analysis.repository': { resultAnalysisRepository: { getById: forbid } },
  '@/lib/services/findings.service': {
    getExperienceFindingsWorkspace: async () => workspace,
    buildRawFindingsEvidenceContent: async () => `SYNTHETIC TEST FIXTURE, NOT REAL PRODUCT EVIDENCE. ${JSON.stringify({ task: workspace.testCases, observations: findings, artifactId })}`,
  },
  '@/lib/services/report.service': { getReportWorkspace: forbid },
  '@/lib/services/research.service': { getResearchWorkspace: async () => ({ completedResult: { sources: [], products: [] } }) },
});
const out = join(root, 'outputs', 'community-style-evaluation', `${Date.now()}-${dimension ? 'dimensions' : 'scene'}`);
await mkdir(out, { recursive: true });
const taskService = load('@/lib/ai/task-service').aiTaskService;
for (const name of ['generateCommunityPost', 'factCheckCommunityPost']) {
  const invoke = taskService[name];
  taskService[name] = options => invoke({ ...options, onResponse: async event => {
    // Provider reasoning is already removed. Retain only structured answer text and safe metadata.
    await writeFile(join(out, `${options.schemaName}-${event.attempt}.json`), JSON.stringify({ content: event.content, route: event.route, usage: event.usage }, null, 2));
    await options.onResponse?.(event);
  } });
}
console.log(JSON.stringify({ output: out, mode }));
await load('@/lib/services/publish.service').generateCommunityPost(productId, {
  ideaId: idea.id,
  config: { ...load('@/lib/publish-config').defaultPublishConfig, stylePreset: '深度观察', structure: mode, imageCount: 0, length: '600–1000字，材料少则缩短', tone: '具体、连贯，围绕真实留存的细节展开。', interactionGoal: '无需互动提问，结尾回应核心问题即可。' },
});
assert.ok(saved?.articleReview);
await writeFile(join(out, 'post.json'), JSON.stringify(saved, null, 2));
await writeFile(join(out, 'sample.md'), `> 写作验证样稿：真实模型生成，输入为虚构测试夹具，不能作为真实产品测评发布。\n\n# ${saved.title}\n\n${saved.body}\n`);
console.log(JSON.stringify({ output: out, mode, chapters: saved.editorialPlan.sections.length, review: saved.articleReview, stages: saved.generationTrace.map(item => item.stage) }));
