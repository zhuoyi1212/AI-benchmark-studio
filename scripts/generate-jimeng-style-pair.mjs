/** Replay archived real inputs through the production pipeline, with filesystem-only output. */
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withStyleVariant, styleGuidance, assertProviderDestination } from './lib/style-pair.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const createLoader = require(path.join(root, 'scripts/lib/load-typescript.cjs'));
if (process.argv.includes('--live')) throw new Error('该冻结源已被当前测试替换并删除，禁止继续调用模型。请使用校验当前线上证据的生成入口。');
const key = 'jimeng';
const variant = process.argv[2];
assert.ok(['current', 'style-card'].includes(variant));
const profile = JSON.parse(await readFile(path.join(root, 'docs/research/turingscat-20261026/style-profile.json'), 'utf8'));
const guidance = variant === 'style-card' ? styleGuidance(profile) : '';
const guidanceHash = digestText(guidance);
function digestText(value) { return createHash('sha256').update(value).digest('hex'); }
assert.ok(!process.env.AI_E2E_PROVIDER_BASE_URL && !process.env.E2E_TEST_MODE);
const frozenDir = path.join(root, 'outputs/reader-candidates-private', key);
const output = path.resolve(process.argv[3] ?? path.join(root, 'outputs/natural-voice-private', key, `style-pair-${variant}-${new Date().toISOString().replace(/[:.]/g, '-')}`));
assert.ok(output.startsWith(path.join(root, 'outputs/natural-voice-private/')));
await mkdir(output, { recursive: true, mode: 0o700 });
const save = (name, value) => writeFile(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const baseline = JSON.parse(await readFile(path.join(frozenDir, 'baseline.private.json'), 'utf8'));
assert.equal(digest(baseline.source), baseline.sourceHash);
const archivedSourceHash = baseline.sourceHash;
const current = JSON.parse(await readFile(path.join(root, 'outputs/community-sharing-private/jimeng/current-source.private.json'), 'utf8'));
assert.deepEqual(current.evidence.tasks, baseline.source.tasks);
assert.deepEqual(current.evidence.artifacts.map(a => a.id).sort(), [...baseline.source.artifactIds].sort());
const preservationArchive = JSON.parse(await readFile(path.join(root, 'outputs/portfolio-cleanup-private/unification-20261023/after.json'), 'utf8'));
for (const artifact of current.evidence.artifacts) {
 const prior = preservationArchive.artifacts.find(a => a.id === artifact.id);
 assert.ok(prior); assert.equal(prior.sha256, artifact.sha256); assert.equal(prior.size_bytes, artifact.size_bytes);
}
baseline.source.facts = current.findings.effective_output;
assert.equal(baseline.source.findingsId, current.findings.id);
baseline.source.findingsRevisionId = current.findings.revision_id;
baseline.sourceHash = digest(baseline.source);
baseline.workspace.pack = { id: current.pack.id, version: current.pack.version, ideas: [current.pack.selected_idea], selectedIdea: current.pack.selected_idea, config: current.pack.config, post: { title: current.pack.title, body: current.pack.body, tags: ['即梦AI','AI海报','文生图'], interactionQuestion: '', screenshotRecommendations: [] } };
const files = await readdir(frozenDir);
async function event(name) {
  const file = files.filter(file => file.includes(`-${name}-`) && file.endsWith('.private.json')).sort().at(-1);
  assert.ok(file); return JSON.parse(await readFile(path.join(frozenDir, file), 'utf8'));
}
const planner = await event('CommunityStoryBrief');
const writer = await event('CommunityPostDraft');
const jsonInput = event => JSON.parse(event.messages.find(m => m.role === 'user' && typeof m.content === 'string' && m.content.startsWith('{')).content);
const frozenPostInput = jsonInput(planner);
const frozenWriter = jsonInput(writer);
const rawEvidence = planner.messages.filter(m => m.role === 'user' && Array.isArray(m.content)).at(-1)?.content;
assert.ok(rawEvidence?.length);
// This archive includes original text and recorded Z.AI observations.
// Reuse them verbatim; do not fetch screenshots, sign URLs or re-extract their contents.
assert.ok(rawEvidence.every(part => part.type === 'text'));
assert.equal(rawEvidence.map(part => part.text).join('\n'), frozenWriter.originalDetails);
const snapshot = JSON.parse(rawEvidence[0].text);
const workspace = baseline.workspace;
const source = baseline.source;
const quick = {
  projectId: source.projectId, projectName: workspace.projectName, projectIntent: '',
  projectMode: workspace.projectMode, evaluationMode: 'quick',
  products: workspace.products, testCases: source.tasks,
  protocolId: source.protocolId, protocolVersion: source.protocolVersion,
  artifacts: source.artifacts.map(artifact => ({ ...artifact, fileUrl: null })),
  latest: { id: source.findingsId, status: 'completed',
    // A provenance marker, not an invented confirmation timestamp.
    humanConfirmedAt: current.findings.human_confirmed_at, editorialRevisionId: current.findings.revision_id, effectiveOutput: source.facts },
};
let row = { id: workspace.pack.id, version: workspace.pack.version, status: 'ready',
  content_ideas: workspace.pack.ideas, selected_idea: workspace.pack.selectedIdea,
  config: workspace.pack.config, community_post: workspace.pack.post };
const localId = randomUUID();
const localOnly = id => assert.equal(id, localId);
let saved;
const immutableInputs = [path.join(frozenDir, 'baseline.private.json'), path.join(root, 'outputs/community-sharing-private/jimeng/current-source.private.json'), path.join(root, 'outputs/portfolio-cleanup-private/unification-20261023/after.json')];
const inputHashes = await Promise.all(immutableInputs.map(async file => digestText(await readFile(file, 'utf8'))));
const localRepository = {
  listByFindings: async id => { assert.equal(id, source.findingsId); return [row]; },
  beginFromFindings: async (pid, fid) => {
    assert.equal(pid, source.projectId); assert.equal(fid, source.findingsId);
    row = { ...row, id: localId, version: row.version + 1, status: 'draft', community_post: null }; return localId;
  },
  startPost: async (id, selectedIdea, config, route, inputSignature) => {
    localOnly(id); await save('start.private.json', { selectedIdea, config, route, inputSignature });
  },
  complete: async (id, post, usage) => {
    localOnly(id); saved = post;
    await save('candidate.private.json', { generatedAt: new Date().toISOString(), key, variant, guidanceHash, profileVersion: variant === 'style-card' ? profile.version : null, projectId: source.projectId,
      sourcePackId: workspace.pack.id, sourceVersion: workspace.pack.version, sourceHash: baseline.sourceHash,
      frozenRawHash: digest(rawEvidence), mode: 'frozen real input, local candidate only', post, usage });
  },
  fail: async (id, message) => { localOnly(id); await save('failure.private.json', { message }); },
};
const forbidden = () => { throw Error('Frozen replay forbids this database/read path'); };
const basePolicy = createLoader(root)('@/lib/community-story-policy');
const experimentalPolicy = { ...basePolicy };
for (const [field, schemaName] of [['storyBriefRules', 'CommunityStoryBrief'], ['storyWritingRules', 'CommunityPostDraft'], ['targetedRevisionRules', 'CommunityPostRevision']]) {
  experimentalPolicy[field] = withStyleVariant({ schemaName, messages: [{ role: 'system', content: basePolicy[field] }] }, variant, profile).messages[0].content;
}
const load = createLoader(root, {
  '@/lib/community-story-policy': experimentalPolicy,
  '@/lib/repositories/publish.repository': { publishRepository: localRepository },
  '@/lib/services/findings.service': { getExperienceFindingsWorkspace: async id => { assert.equal(id, source.projectId); return quick; }, buildRawFindingsEvidenceContent: async (id, options) => {
    assert.equal(id, source.projectId); assert.deepEqual([...options.artifactIds].sort(), source.artifactIds); return structuredClone(rawEvidence);
  } },
  '@/lib/services/research.service': { getResearchWorkspace: async () => ({ completedResult: { products: snapshot.research } }) },
  '@/lib/services/report.service': { getReportWorkspace: forbidden },
  '@/lib/repositories/result-analysis.repository': { resultAnalysisRepository: { getById: forbidden } },
});
const originalFetch = globalThis.fetch;
let providerRequests = 0;
const requests = [];
globalThis.fetch = async (input, init) => {
  assertProviderDestination(input, init);
  const body = JSON.parse(init.body);
  providerRequests++;
  requests.push({ sequence: providerRequests, model: body.model, schemaName: body.messages[0].content.match(/for schema ([^:]+):/)[1],
    messagesHash: digest(body.messages), maxTokens: body.max_completion_tokens ?? body.max_tokens,
    reasoningEffort: body.reasoning_effort ?? null, thinking: body.thinking ?? null, stream: body.stream });
  await writeFile(path.join(output, 'request-controls.private.json'), JSON.stringify(requests, null, 2) + '\n', { mode: 0o600 });
  return originalFetch(input, { ...init, redirect: 'error' });
};
const ai = load('@/lib/ai/task-service').aiTaskService;
let responseCount = 0;
const resumedStages = [];
const resumeCompletedIndex = process.argv.indexOf('--resume-completed-from');
const resumeIndex = resumeCompletedIndex >= 0 ? resumeCompletedIndex : process.argv.indexOf('--resume-planning-from');
const resumableStages = new Set(resumeCompletedIndex >= 0 ? ['CommunityStoryBrief', 'CommunityPostDraft', 'CommunityPostReview'] : ['CommunityStoryBrief']);
const resume = resumeIndex < 0 ? null : path.resolve(process.argv[resumeIndex + 1]);
if (resume) {
  assert.ok(resume.startsWith(path.join(root, 'outputs/natural-voice-private', key) + path.sep));
  const priorExperiment = JSON.parse(await readFile(path.join(resume, 'experiment.private.json'), 'utf8'));
  assert.equal(priorExperiment.variant, variant);
  assert.equal(priorExperiment.guidanceHash, guidanceHash);
  assert.equal(priorExperiment.currentSourceHash, digest(current));
  assert.deepEqual(priorExperiment.inputHashes, inputHashes);
}
for (const name of ['discoverContentIdeas', 'generateCommunityPost', 'humanizeCommunityPost', 'factCheckTextCommunityPost', 'factCheckCommunityPost']) {
  const execute = ai[name];
  ai[name] = async options => {
    await save(`input-${options.schemaName}.private.json`, { messages: options.messages, maxTokens: options.maxTokens, maxAttempts: options.maxAttempts });
    if (resume && resumableStages.has(options.schemaName)) {
      const priorInput = JSON.parse(await readFile(path.join(resume, `input-${options.schemaName}.private.json`), 'utf8'));
      assert.deepEqual(priorInput, { messages: options.messages, maxTokens: options.maxTokens, maxAttempts: options.maxAttempts });
      const priorFiles = (await readdir(resume)).filter(name => new RegExp(`^\\d+-${options.schemaName}-\\d+\\.private\\.json$`).test(name)).sort();
      const priorFile = priorFiles.at(-1);
      assert.ok(priorFile);
      const prior = JSON.parse(await readFile(path.join(resume, priorFile), 'utf8'));
      const data = options.schema.parse(JSON.parse(prior.content));
      await options.beforeExecute?.(prior.route);
      resumedStages.push({ stage: options.schemaName, archive: path.basename(resume), response: priorFile });
      await save(`${String(++responseCount).padStart(2, '0')}-${options.schemaName}-resumed.private.json`, { ...prior, resumed: true });
      console.log(JSON.stringify({ key, variant, phase: options.schemaName, resumed: true }));
      return { data, route: prior.route, usage: prior.usage };
    }
    return execute({ ...options, onResponse: async response => {
      await save(`${String(++responseCount).padStart(2, '0')}-${options.schemaName}-${response.attempt}.private.json`, {
        schemaName: options.schemaName, route: response.route, content: response.content, messages: response.messages, usage: response.usage,
      });
      console.log(JSON.stringify({ key, variant, phase: options.schemaName, attempt: response.attempt }));
      await options.onResponse?.(response);
    } });
  };
}
await save('frozen-input.private.json', { sourceHash: baseline.sourceHash, rawHash: digest(rawEvidence), config: workspace.pack.config, currentSourceHash: digest(current), currentSource: current, frozenPostInput, frozenWriter });
console.log(JSON.stringify({ key, variant, phase: 'preflight', sourceHash: baseline.sourceHash, rawHash: digest(rawEvidence), databaseRequests: 0, output }));
await save('experiment.private.json', { variant, guidanceHash, profileVersion: profile.version, guidance, localOnly: true, currentSourceHash: digest(current), inputHashes });
if (!process.argv.includes('--live')) process.exit(0);
await load('@/lib/services/publish.service').generateCommunityPost(source.projectId, {
  ideaId: workspace.pack.selectedIdea.id, customAngle: workspace.pack.selectedIdea.id === 'custom' ? workspace.pack.selectedIdea.angle : undefined,
  config: workspace.pack.config, expectedPackId: workspace.pack.id,
});
assert.equal(saved.contentPolicyVersion, load('@/lib/community-story-policy').storyPolicyVersion);
assert.equal(digest(JSON.parse(await readFile(path.join(frozenDir, 'baseline.private.json'), 'utf8')).source), archivedSourceHash);
await save('verification.private.json', { databaseRequests: 0, databaseWrites: 0, providerRequests, responseCount,
  sourceHash: baseline.sourceHash, frozenRawHash: digest(rawEvidence), currentConfirmedSourceUsed: true, archivedRawEvidenceReused: true, originalArtifactMetadataMatched: true, originalArchiveUnchanged: true,
  appWrites: 0, deploys: 0, policyVersion: saved.contentPolicyVersion, variant, guidanceHash, profileVersion: variant === 'style-card' ? profile.version : null, requests, replayedResponses: resumedStages.length, resumedStages,
  inputFilesUnchanged: assert.deepEqual(await Promise.all(immutableInputs.map(async file => digestText(await readFile(file, 'utf8')))), inputHashes) === undefined });
console.log(JSON.stringify({ key, variant, phase: 'completed', chars: saved.body.length, policyVersion: saved.contentPolicyVersion, providerRequests, databaseRequests: 0, output }));
