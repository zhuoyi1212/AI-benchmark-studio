import { fileURLToPath } from 'node:url';
import createLoader from '../../scripts/lib/load-typescript.cjs';
export const id = '11111111-1111-4111-8111-111111111111';
export const config = { channel: '通用社区', goal: '分享真实体验', stylePreset: '真实体验', structure: '好用 / 一般 / 难用', tone: '具体自然', length: '材料少则缩短', imageCount: 0, interactionGoal: '无需提问' };
export const findings = [{ id: 'finding-list', productId: id, testCaseId: id, title: '准备清单具体', category: 'good', observation: '回答建议写下项目的3个硬数字，并提前约15分钟沟通。', impact: '准备材料和约时间有了明确要求。', evidenceArtifactIds: [id], confidence: 0.9 }];
export const quick = {
  projectName: '内容规范验证夹具', projectIntent: '验证写作，不是真实产品测评', projectMode: 'single',
  products: [{ id, name: '沟通工具样本' }], testCases: [{ id, title: '加薪沟通', prompt: '老板强势、注重结果，在预算紧张的条件下如何沟通加薪？' }], protocolId: id, protocolVersion: 1,
  latest: { id, status: 'completed', humanConfirmedAt: '2026-10-04', effectiveOutput: { summary: '一次沟通建议测试', findings, limitations: ['只测试了强势老板提出预算紧张的情境。'] } },
  artifacts: [{ artifactId: id, productId: id, testCaseId: id, fileName: 'fixture.txt', mimeType: 'text/plain', fileUrl: null }],
};
export const idea = { id: 'idea-1', title: '准备清单具体到数字和时间', type: '体验', angle: '加薪沟通准备', insight: '回答给出了具体准备步骤。', whyInteresting: '有实际细节', supportingEvidence: [findings[0].observation], relatedTestCaseIds: [id], relatedArtifactIds: [], informationValue: 0.8, discussionPotential: 0.8, confidence: 0.9, recommended: true };
export const review = { concreteScenes: true, boundedInterpretation: true, nonRepetitive: true, usefulConclusion: true, issues: [] };
export const preservation = { facts: true, scope: true, stance: true, experience: true, advice: true, evidence: true, issues: [] };
export const draft = {
  title: '沟通工具样本：准备清单具体到数字和时间', body: `这次测试关注老板提出预算紧张时如何准备加薪沟通。${findings[0].observation}准备材料和约时间有了明确要求，但本次没有验证实际沟通效果。`,
  tags: ['沟通'], interactionQuestion: '', screenshotRecommendations: [],
  contentBrief: { coreViewpoint: idea.insight, opening: '先说任务', supportingPoints: [{ finding: findings[0].observation, userMeaning: findings[0].impact }], ending: '只限本次回答', voice: '自然具体', avoidPhrases: [] },
  writingPlan: { template: 'single_scene', scopeNotes: quick.latest.effectiveOutput.limitations, sections: [{ heading: idea.title, sourceIds: [findings[0].id], observationQuote: findings[0].observation, judgment: idea.insight }] },
};
export const rawEvidence = `合成验证夹具，不是真实产品测评。任务：老板强势、注重结果，如何在预算紧张时沟通加薪。回答：写下项目的3个硬数字，提前约15分钟沟通。没有真实用户情绪记录，也没有实际沟通结果。artifactId=${id}`;
const route = { provider: 'deepseek', model: 'fixture', promptVersion: 'fixture-v1' };
const usage = { inputTokens: 10, outputTokens: 20, latencyMs: 1, estimatedCost: null };
export function harness({ mutate, professional = false, realAI = false, raw = rawEvidence, workspace = quick, readyPack, revisionFailure = false, regenerationJob = null } = {}) {
  const state = { calls: [], saved: null, failure: null, rawReads: 0 };
  const invoke = async options => {
    state.calls.push(options);
    await options.beforeExecute?.(route);
    const json = options.messages.find(m => m.role === 'user' && typeof m.content === 'string' && m.content.startsWith('{'));
    const input = json ? JSON.parse(json.content) : {};
    let value;
    if (options.schemaName === 'PublicationVideoObservations') {
      value = { observations: ['视频画面显示写下项目的3个硬数字，并提前约15分钟沟通。'] };
    } else if (options.schemaName === 'CommunityStoryBrief') {
      value = { readerQuestion: '如何准备预算紧张时的加薪沟通？', targetReader: '准备沟通加薪的人', spine: idea.insight,
        supportingPoints: [{ claim: idea.insight, readerValue: findings[0].impact, findingIds: [input.factLedger[0].id], evidenceArtifactIds: [id], detail: findings[0].observation, role: 'main' }],
        corePromiseGaps: ['实际沟通结果未测'], scope: '只限本次建议', ending: '可用作准备清单，不保证沟通结果', avoidClaims: [], comparison: false };
    } else if (options.schemaName === 'CommunityPostDraft') {
      value = { title: draft.title, body: draft.body, tags: draft.tags, interactionQuestion: draft.interactionQuestion };
    } else if (options.schemaName === 'CommunityPostReview') {
      value = { articleReview: review, issues: [] };
    } else if (options.schemaName === 'CommunityPostRevision') {
      value = { ...input.draft, body: input.draft.body + '这份清单可以用来准备沟通。' };
    } else if (options.schemaName === 'EvidenceCheckedCommunityPost') {
      value = { articleReview: review, stylePreservation: preservation, screenshotRecommendations: [] };
    } else if (options.schemaName === 'CommunityPostTitle') {
      value = { reviewSummary: { testPurpose: '加薪准备建议', mainResult: '准备材料与时间具体' }, title: '沟通工具样本加薪实测：准备建议具体' };
    } else throw new Error(options.schemaName);
    value = structuredClone(value);
    if (mutate) value = await mutate(options.schemaName, value, input) ?? value;
    return { data: options.schema.parse(value), route, usage };
  };
  const forbid = () => { throw new Error('Unexpected professional source'); };
  const repo = {
    listByFindings: async () => readyPack ? [readyPack] : [{ id, status: 'draft', content_ideas: [idea] }],
    listByReport: async () => [{ id, status: 'draft', content_ideas: [idea] }],
    startPost: async (_id, _idea, value) => { state.config = value; },
    complete: async (_id, value, cost) => { state.saved = value; state.usage = cost; },
    fail: async (_id, value) => { state.failure = value; },
    listArtifacts: async () => (readyPack?.community_post?.screenshotRecommendations ?? []).map(s => ({
      artifact_id: s.artifactId, reason: s.reason, supports_claim: s.supportsClaim,
      supports_paragraph: s.supportsParagraph, display_order: s.order,
    })),
    refreshTitle: async (sourceId, title, audit) => {
      state.refreshed = { sourceId, title, audit };
      return '22222222-2222-4222-8222-222222222222';
    },
    createRevision: async (...args) => {
      if (revisionFailure) throw new Error('DB failed');
      state.revision = args;
      return '22222222-2222-4222-8222-222222222222';
    },
  };
  const overrides = {
    '@/lib/repositories/quick-jobs.repository': { quickJobsRepository: { get: async () => regenerationJob } },
    '@/lib/quick/checkpoints': { quickExecution: { getStore: () => undefined }, QuickYield: class extends Error {}, checkpoint: async (_name, _input, execute) => execute() },
    '@/lib/repositories/publish.repository': { publishRepository: repo },
    '@/lib/services/findings.service': { getExperienceFindingsWorkspace: async () => professional ? null : workspace, buildRawFindingsEvidenceContent: async (_id, options) => { state.rawOptions = options; state.rawReads++; return typeof raw === 'function' ? raw() : raw; } },
    '@/lib/services/research.service': { getResearchWorkspace: async () => ({ completedResult: { products: [] } }) },
    '@/lib/services/report.service': { getReportWorkspace: professional ? async () => ({ projectName: '验证', projectIntent: '验证', report: { id, status: 'completed', content: { secretReport: 'DO NOT SEND' } }, resultAnalysisId: id, ranking: [{ productId: id, productName: '样本', score: 8 }], protocol: { testCases: quick.testCases }, evidence: [], analysis: { limitations: ['只测一次'] } }) : forbid },
    '@/lib/repositories/result-analysis.repository': { resultAnalysisRepository: { getById: professional ? async () => ({ input_snapshot: { products: [{ productId: id, productName: '样本', scores: [{ testCaseId: id, rubricDimensionId: id, finalScore: 8, evidence: [findings[0].observation], reason: findings[0].impact }], artifacts: [{ artifactId: id, testCaseId: id }] }] } }) : forbid } },
    '@/lib/ai/schemas/result-analysis.schemas': { resultAnalysisInputSchema: { parse: value => value } },
  };
  if (!realAI) overrides['@/lib/ai/task-service'] = { aiTaskService: { discoverContentIdeas: invoke, generateCommunityPost: invoke, generateCommunityPostTitle: invoke, humanizeCommunityPost: invoke, factCheckTextCommunityPost: invoke, factCheckCommunityPost: invoke } };
  const load = createLoader(fileURLToPath(new URL('../..', import.meta.url)), overrides);
  return { state, load, run: (settings = config) => load('@/lib/services/publish.service').generateCommunityPost(id, { ideaId: idea.id, config: settings }) };
}
