import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { buildFindingSections, communityExpressionIssues, experienceWritingRules, communityExpressionRules } from '../lib/community-experience.ts';
import { formatCommunityBody, formatPersonalRating } from '../lib/community-post-formatter.ts';
import { publishConfigSchema, communityPostOutputSchema } from '../lib/ai/schemas/publish.schemas.ts';

const config = publishConfigSchema.parse({ channel: '小红书', goal: '分享真实体验', tone: '直接', length: '800字', imageCount: 3, interactionGoal: '交流' });
const findings = [
  ['good', 'AI 对话可定位视频时间点'], ['good', '思维导图可以导出'],
  ['neutral', '基础总结偏字幕整理'], ['neutral', '高光和全文总结差异不明显'],
  ['problem', '某学校课程网站导入失败'], ['problem', '导图缺少知识层级'],
].map(([category, title], i) => ({ id: `finding-${i}`, category, title, observation: title, impact: '影响本次课程整理', evidenceArtifactIds: [`artifact-${i}`] }));
const body = ['我的感受是：对话定位和导图导出很方便，但我测的学校网站导入失败。', '好用的功能', '1. AI 对话\n能定位视频时间点，找知识点时不用拖进度条。', '2. 导图导出\n思维导图可以导出，方便留存。', '体验一般的功能', '基础总结偏字幕整理，高光和全文总结差异不明显。', '不能用 / 用着难受的功能', '这次学校课程网站导入失败；导图缺少知识层级。', '个人感受', '对我来说，定位时间点很省事，但学校课程还得先确认能否导入。'].join('\n\n');
const post = { title: '视频总结工具实测', body, tags: ['使用体验'], interactionQuestion: '你用过吗？', screenshotRecommendations: [], editorialPlan: { coreConclusion: '定位省事，学校课程导入失败', highlights: [findings[0].title], neutralPoints: [findings[2].title], painPoints: [findings[4].title], structure: [...buildFindingSections(findings).map(s => s.heading), '个人感受'], avoidClaims: ['非主流平台失败率高'], openingAngle: '我的感受是', closingTakeaway: '先确认学校课程能否导入' } };
const rating = { enabled: true, score: 4, scale: 5, reason: '扣分主要在这次学校课程导入失败和总结不够深。', findingIds: ['finding-4', 'finding-2'] };
const rated = { ...post, editorialPlan: { ...post.editorialPlan, personalRating: rating } };

test('golden Findings organize real categories and personal takeaway without padding', () => {
  assert.deepEqual(buildFindingSections(findings).map(s => s.findings.length), [2, 2, 2]);
  assert.deepEqual(post.editorialPlan.structure, ['好用的功能', '体验一般的功能', '不能用 / 用着难受的功能', '个人感受']);
  assert.deepEqual(communityExpressionIssues(post, config, findings), []);
  assert.deepEqual(buildFindingSections(findings.filter(f => f.category === 'problem')).map(s => s.category), ['problem']);
  assert.ok(communityExpressionIssues(post, config, findings.filter(f => f.category !== 'good')).length);
});
test('style policy is used as a runtime regression gate', () => {
  for (const term of ['第一人称', '先说结论', '好用 / 一般 / 难用', '个人感受']) assert.ok(experienceWritingRules.includes(term));
  for (const phrase of ['总体而言', '值得注意的是', '此次测评表明', '综合来看', '表现出较强']) {
    assert.ok(experienceWritingRules.includes(phrase));
    assert.ok(communityExpressionIssues({ ...post, body: `${body}\n\n${phrase}，很好。` }, config, findings).length);
  }
  assert.ok(communityExpressionIssues({ ...post, body: body.replace(body.split('\n\n')[0], '这款产品提供视频总结功能。') }, config, findings).length);
});
test('personal rating defaults off and only confirmed findings can authorize it', () => {
  assert.equal(config.personalRatingEnabled, false); assert.equal(config.personalRatingScale, 5);
  assert.ok(communityExpressionIssues(rated, config, findings).length);
  const enabled = { ...config, personalRatingEnabled: true };
  assert.deepEqual(communityExpressionIssues(rated, enabled, findings), []);
  assert.ok(communityExpressionIssues(rated, enabled, []).length);
  for (const invalid of [{ score: 6 }, { scale: 10 }, { findingIds: ['unknown'] }, { enabled: false }, { reason: '官方评分4分' }]) {
    assert.ok(communityExpressionIssues({ ...rated, editorialPlan: { ...rated.editorialPlan, personalRating: { ...rating, ...invalid } } }, enabled, findings).length);
  }
  assert.match(formatPersonalRating(rating), /如果满分5分，我个人会给4分/);
  assert.equal(formatPersonalRating({ enabled: false }), '');
  assert.ok(communityExpressionIssues({ ...post, body: body + '\n\n我给4分。' }, config, findings).length);
  assert.match(communityExpressionRules, /不能混入 Final Score/);
});
test('screenshot formatter follows selection, removal and replacement without inheriting evidence', () => {
  const refs = [{ artifactId: 'a', supportsParagraph: 3, supportsClaim: '能定位视频时间点' }, { artifactId: 'b', supportsParagraph: 4, supportsClaim: '思维导图可以导出' }];
  const render = (ids, draft = body, available = ['a', 'b', 'c']) => formatCommunityBody(draft, body, ids, available, refs);
  assert.match(render(['a', 'b']), /拖进度条。（p1）/);
  assert.match(render(['b', 'a']), /拖进度条。（p2）/);
  assert.match(render(['b']), /方便留存。（p1）/);
  assert.doesNotMatch(render(['b']), /p2/);
  assert.doesNotMatch(render(['c']), /（p/);
  assert.doesNotMatch(render(['a'], body.replace('能定位视频时间点', '段落已被改写')), /（p/);
  assert.match(render(['a'], '插入新段落\n\n' + body), /拖进度条。（p1）/);
  assert.doesNotMatch(render(['a'], body, []), /（p/);
  assert.equal((render(['a', 'a']).match(/（p1）/g) ?? []).length, 1);
  assert.doesNotMatch(render([], body + '（p99）'), /p99/);
  assert.equal(render(['a'], render(['a'])), render(['a']));
});
test('invalid final paragraph mappings and AI-authored display markers fail validation', () => {
  assert.ok(communityExpressionIssues({ ...post, screenshotRecommendations: [{ artifactId: 'a', supportsParagraph: 99, supportsClaim: '导图' }] }, config, findings).length);
  assert.ok(communityExpressionIssues({ ...post, body: body + '（p1）' }, config, findings).length);
});
test('old posts and configs remain readable without new editorial fields', () => {
  const { editorialPlan, ...legacy } = post;
  assert.equal(communityPostOutputSchema.safeParse(legacy).success, true);
});
test('generation and final raw Artifact fact-check both retain expression rules', async () => {
  const service = await readFile(new URL('../lib/services/publish.service.ts', import.meta.url), 'utf8');
  assert.equal((service.match(/config.stylePreset === "真实体验" \? experienceWritingRules/g) ?? []).length, 2);
  assert.match(service, /buildRawFindingsEvidenceContent\(projectId, \{ preferPdfText: true \}\)/);
  assert.match(service, /factCheckTextCommunityPost/);
  assert.match(service, /requiresVision/);
  assert.match(service, /schema: communityPostHumanizedSchema/);
  assert.match(service, /schema: checkedExpressionSchema/);
  assert.match(service, /normalizePostForValidation/);
  assert.match(service, /expectedHeadings/);
  assert.match(service, /communityExpressionIssues\(post, config, confirmedFindings\)/);
  assert.match(service, /一个学校网站失败/);
  const repository = await readFile(new URL('../lib/repositories/publish.repository.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(repository, /judge_scores|final_score|human_review_events/);
  assert.match(repository, /editorialPlan: post.editorialPlan/);
});

test('Quick Publish reaches ready through draft, language pass, and raw evidence checking', async () => {
  const ts = await import('typescript');
  const schemas = await import('../lib/ai/schemas/publish.schemas.ts');
  const expression = await import('../lib/community-experience.ts');
  const source = await readFile(new URL('../lib/services/publish.service.ts', import.meta.url), 'utf8');
  const code = ts.default.transpileModule(source, { compilerOptions: { module: ts.default.ModuleKind.CommonJS, target: ts.default.ScriptTarget.ES2022 } }).outputText;
  const id = '11111111-1111-4111-8111-111111111111';
  const grounded = findings.map(f => ({ ...f, productId: id, testCaseId: id, evidenceArtifactIds: [id], confidence: 0.9 }));
  const idea = { id: 'idea-1', title: '视频工具实测', type: '体验', angle: '课程整理', insight: '定位省事但学校课程导入失败', whyInteresting: '真实体验', supportingEvidence: ['留存课程测试'], relatedTestCaseIds: [id], relatedArtifactIds: [id], informationValue: 0.8, discussionPotential: 0.8, confidence: 0.9, recommended: true };
  const quick = { projectName: '课程整理', projectIntent: '测试', projectMode: 'single', products: [{ id, name: '视频工具' }], testCases: [{ id, title: '课程' }], protocolId: id, protocolVersion: 1, latest: { id, status: 'completed', humanConfirmedAt: '2026-09-21', effectiveOutput: { summary: '真实课程测试', findings: grounded, limitations: ['仅本次测试'] } }, artifacts: [{ artifactId: id, productId: id, testCaseId: id, fileName: 'course.png', mimeType: 'image/png', fileUrl: 'https://example.invalid/course.png', caption: '真实存档', productName: '视频工具', testCaseTitle: '课程' }] };
  const contentBrief = { coreViewpoint: '定位省事，但本次学校课程导入失败。', opening: '先说这次真实测试。', supportingPoints: [{ finding: findings[0].observation, userMeaning: findings[0].impact }, { finding: findings[4].observation, userMeaning: findings[4].impact }], ending: '使用前先确认课程能否导入。', voice: '第一人称、直接', avoidPhrases: ['总体而言'] };
  const languagePass = { status: 'polished', changedSentenceCount: 2, notes: ['删除报告腔'] };
  const generated = { ...rated, contentBrief, languagePass, factCheck: { status: 'revised', revisedClaimCount: 1, notes: ['收缩为本次学校网站'] }, screenshotRecommendations: [{ artifactId: id, reason: '定位证据', supportsClaim: '能定位视频时间点', supportsParagraph: 3, order: 1 }] };
  const route = { provider: 'deepseek', model: 'test-model', promptVersion: 'test-v1' };
  const usage = { inputTokens: 10, outputTokens: 20, latencyMs: 100, estimatedCost: null };
  let draftCalls = 0; let humanizeCalls = 0; let checks = 0; let rawReads = 0;
  let startedConfig; let saved; let savedUsage; let failure;
  const forbidden = () => { throw new Error('Quick flow touched professional source'); };
  const deps = {
    'server-only': {},
    '@/lib/quick/checkpoints': { quickExecution: { getStore: () => undefined }, QuickYield: class extends Error {} },
    '@/lib/community-experience': expression,
    '@/lib/ai/errors': { AIProviderError: class extends Error {}, AIValidationError: class extends Error {} },
    '@/lib/ai/schemas/publish.schemas': schemas,
    '@/lib/ai/schemas/result-analysis.schemas': { resultAnalysisInputSchema: { parse: forbidden } },
    '@/lib/ai/task-service': { aiTaskService: {
      generateCommunityPost: async options => { draftCalls++; await options.beforeExecute?.(route); return { data: options.schema.parse({ ...generated, languagePass: undefined, factCheck: undefined }), route, usage }; },
      humanizeCommunityPost: async options => { humanizeCalls++; assert.ok(draftCalls); return { data: options.schema.parse({ ...generated, factCheck: undefined }), route, usage }; },
      factCheckCommunityPost: async options => { checks++; assert.equal(options.messages.at(-1).content, 'RAW-ARTIFACT'); return { data: options.schema.parse(generated), route, usage }; },
      factCheckTextCommunityPost: async options => { checks++; assert.equal(options.messages.at(-1).content, 'RAW-ARTIFACT'); return { data: options.schema.parse(generated), route, usage }; },
    } },
    '@/lib/repositories/publish.repository': { publishRepository: {
      listByFindings: async () => [{ id, status: 'draft', content_ideas: [idea] }],
      startPost: async (_id, _idea, value) => { startedConfig = value; },
      complete: async (_id, value, valueUsage) => { saved = value; savedUsage = valueUsage; },
      fail: async (_id, value) => { failure = value; },
    } },
    '@/lib/publish-config': { defaultPublishConfig: config },
    '@/lib/repositories/repository-error': { RepositoryError: class extends Error {} },
    '@/lib/repositories/result-analysis.repository': { resultAnalysisRepository: { getById: forbidden } },
    '@/lib/project-mode': { getProjectMode: forbidden },
    '@/lib/signatures': { createInputSignature: () => 'signature' },
    '@/lib/services/findings.service': { getExperienceFindingsWorkspace: async () => quick, buildRawFindingsEvidenceContent: async () => { rawReads++; return 'RAW-ARTIFACT'; } },
    '@/lib/services/report.service': { getReportWorkspace: forbidden },
    '@/lib/services/research.service': { getResearchWorkspace: async () => ({ completedResult: { products: [] } }) },
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => { assert.ok(name in deps, name); return deps[name]; }, module, module.exports);
  await module.exports.generateCommunityPost(id, { ideaId: idea.id, config: { ...config, personalRatingEnabled: true } });
  assert.equal(failure, undefined);
  assert.equal(draftCalls, 1); assert.equal(humanizeCalls, 1); assert.equal(checks, 1); assert.equal(rawReads, 1);
  assert.equal(startedConfig.personalRatingEnabled, true);
  assert.equal(saved.factCheck.status, 'revised');
  assert.equal(savedUsage.inputTokens, 30);
});
