/** Read current evidence, then run the real pipeline with filesystem-only persistence. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import createLoader from './lib/load-typescript.cjs';
import { withStyleVariant, styleGuidance } from './lib/style-pair.mjs';
import { digest, readCurrentEvidenceStamp, requireSameEvidence, allowReadOnlyExperimentRequest } from './lib/current-evidence.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const projectId = '77ac52ae-cb4c-477b-9783-688dead41c12';
const experimentRoot = path.join(root, 'outputs/natural-voice-private/jimeng/current-images-20261026');
const mode = process.argv[2];
assert.ok(['capture', 'current', 'style-card'].includes(mode));
assert.ok(!process.env.E2E_TEST_MODE && !process.env.AI_E2E_PROVIDER_BASE_URL);
const supabaseOrigin = new URL(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL).origin;
const realFetch = globalThis.fetch;
let sourceReads = 0;
const requests = [];
let verifyBeforeProvider = async () => {};
globalThis.fetch = async (input, init) => {
  const kind = allowReadOnlyExperimentRequest(input, init, supabaseOrigin);
  if (kind === 'source-read') sourceReads++;
  else {
    assert.ok(mode !== 'capture' && process.argv.includes('--live'), '捕获来源阶段不能调用AI');
    await verifyBeforeProvider();
    const body = JSON.parse(init.body);
    requests.push({ sequence: requests.length + 1, model: body.model,
      schemaName: body.messages[0].content.match(/for schema ([^:]+):/)[1],
      maxTokens: body.max_completion_tokens ?? body.max_tokens, reasoning: body.reasoning_effort ?? null,
      thinking: body.thinking ?? null, messagesHash: digest(body.messages) });
  }
  return realFetch(input, { ...init, redirect: 'error' });
};
const sourceLoad = createLoader(root);
const snapshotFile = path.join(experimentRoot, 'current-source.private.json');
const write = (dir, name, value) => writeFile(path.join(dir, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
await mkdir(experimentRoot, { recursive: true, mode: 0o700 });
if (mode === 'capture') {
  const stamp = await readCurrentEvidenceStamp(sourceLoad, projectId);
  const findings = sourceLoad('@/lib/services/findings.service');
  const quick = await findings.getExperienceFindingsWorkspace(projectId);
  const workspace = await sourceLoad('@/lib/services/publish.service').getPublishWorkspace(projectId);
  const research = await sourceLoad('@/lib/services/research.service').getResearchWorkspace(projectId);
  assert.equal(quick?.protocolId, stamp.protocolId);
  assert.equal(workspace?.findingsId, stamp.findingsId);
  assert.equal(quick?.latest?.id, stamp.findingsId);
  assert.ok(workspace?.pack?.selectedIdea && research?.completedResult);
  assert.deepEqual(quick.artifacts.map(item => item.artifactId).sort(), stamp.artifacts.map(item => item.id).sort());
  const rawEvidence = await findings.buildRawFindingsEvidenceContent(projectId, { preferPdfText: true,
    artifactIds: stamp.artifacts.map(item => item.id), testCaseIds: quick.testCases.map(item => item.id) });
  requireSameEvidence(stamp, await readCurrentEvidenceStamp(sourceLoad, projectId));
  await write(experimentRoot, 'current-source.private.json', { capturedAt: new Date().toISOString(), stamp, quick,
    pack: workspace.pack, research: research.completedResult, rawEvidence });
  console.log(JSON.stringify({ mode, protocolVersion: stamp.protocolVersion, artifacts: stamp.artifacts.length, sourceReads, providerRequests: requests.length }));
  process.exit(0);
}
const snapshot = JSON.parse(await readFile(snapshotFile, 'utf8'));
const snapshotHash = digest(snapshot);
verifyBeforeProvider = async () => requireSameEvidence(snapshot.stamp, await readCurrentEvidenceStamp(sourceLoad, projectId));
await verifyBeforeProvider();
const profile = JSON.parse(await readFile(path.join(root, 'docs/research/turingscat-20261026/style-profile.json'), 'utf8'));
const guidanceHash = digest(mode === 'style-card' ? styleGuidance(profile) : '');
const output = path.resolve(experimentRoot, process.argv[3] ?? `${mode}-run1`);
assert.ok(output.startsWith(experimentRoot + path.sep));
await mkdir(output, { recursive: true, mode: 0o700 });
const save = (name, value) => write(output, name, value);
const basePolicy = sourceLoad('@/lib/community-story-policy');
const policy = { ...basePolicy };
for (const [field, schemaName] of [['storyBriefRules', 'CommunityStoryBrief'], ['storyWritingRules', 'CommunityPostDraft'], ['targetedRevisionRules', 'CommunityPostRevision']]) {
  policy[field] = withStyleVariant({ schemaName, messages: [{ role: 'system', content: basePolicy[field] }] }, mode, profile).messages[0].content;
}
const localId = randomUUID();
let row = { id: snapshot.pack.id, version: snapshot.pack.version, status: 'ready', content_ideas: snapshot.pack.ideas,
  selected_idea: snapshot.pack.selectedIdea, config: snapshot.pack.config, community_post: snapshot.pack.post };
let saved;
const localOnly = id => assert.equal(id, localId);
const forbidden = () => { throw new Error('本地实验禁止访问其他来源或写入线上'); };
const load = createLoader(root, {
  '@/lib/community-story-policy': policy,
  '@/lib/services/findings.service': { getExperienceFindingsWorkspace: async id => {
    assert.equal(id, projectId); await verifyBeforeProvider(); return snapshot.quick;
  }, buildRawFindingsEvidenceContent: async (id, options) => {
    assert.equal(id, projectId); await verifyBeforeProvider();
    assert.deepEqual([...options.artifactIds].sort(), snapshot.stamp.artifacts.map(item => item.id).sort());
    return snapshot.rawEvidence;
  } },
  '@/lib/services/research.service': { getResearchWorkspace: async () => ({ completedResult: snapshot.research }) },
  '@/lib/services/report.service': { getReportWorkspace: forbidden },
  '@/lib/repositories/result-analysis.repository': { resultAnalysisRepository: { getById: forbidden } },
  '@/lib/repositories/publish.repository': { publishRepository: {
    listByFindings: async id => { assert.equal(id, snapshot.stamp.findingsId); return [row]; },
    beginFromFindings: async (pid, fid) => {
      assert.equal(pid, projectId); assert.equal(fid, snapshot.stamp.findingsId);
      row = { ...row, id: localId, status: 'draft', version: row.version + 1, community_post: null }; return localId;
    },
    startPost: async (id, selectedIdea, config, route, inputSignature) => { localOnly(id); await save('start.private.json', { selectedIdea, config, route, inputSignature }); },
    complete: async (id, post, usage) => { localOnly(id); await verifyBeforeProvider(); saved = post; await save('candidate.private.json', { variant: mode, snapshotHash, guidanceHash, post, usage }); },
    fail: async (id, message) => { localOnly(id); await save('failure.private.json', { message }); },
  } },
});
const resumeIndex = process.argv.indexOf('--resume-from');
const resume = resumeIndex < 0 ? null : path.resolve(experimentRoot, process.argv[resumeIndex + 1]);
if (resume) {
  assert.ok(resume.startsWith(experimentRoot + path.sep));
  const previous = JSON.parse(await readFile(path.join(resume, 'experiment.private.json'), 'utf8'));
  assert.equal(previous.variant, mode); assert.equal(previous.snapshotHash, snapshotHash); assert.equal(previous.guidanceHash, guidanceHash);
}
const resumedStages = [];
const service = load('@/lib/ai/task-service').aiTaskService;
let responseCount = 0;
for (const name of ['discoverContentIdeas', 'generateCommunityPost', 'humanizeCommunityPost', 'factCheckTextCommunityPost', 'factCheckCommunityPost']) {
  const execute = service[name];
  service[name] = async options => {
    await verifyBeforeProvider();
    await save(`input-${options.schemaName}.private.json`, { messages: options.messages, maxTokens: options.maxTokens, maxAttempts: options.maxAttempts });
    if (resume && ['CommunityStoryBrief', 'CommunityPostDraft', 'CommunityPostReview'].includes(options.schemaName)) {
      const previousInput = JSON.parse(await readFile(path.join(resume, `input-${options.schemaName}.private.json`), 'utf8'));
      assert.deepEqual(previousInput, { messages: options.messages, maxTokens: options.maxTokens, maxAttempts: options.maxAttempts });
      const file = (await readdir(resume)).filter(file => file.includes(`-${options.schemaName}-`) && file.endsWith('.private.json')).sort().at(-1);
      assert.ok(file);
      const previous = JSON.parse(await readFile(path.join(resume, file), 'utf8'));
      const data = options.schema.parse(JSON.parse(previous.content));
      await options.beforeExecute?.(previous.route);
      resumedStages.push({ stage: options.schemaName, archive: path.basename(resume), file });
      await save(`${String(++responseCount).padStart(2, '0')}-${options.schemaName}-resumed.private.json`, { ...previous, resumed: true });
      return { data, route: previous.route, usage: previous.usage };
    }
    return execute({ ...options, onResponse: async response => {
      await verifyBeforeProvider();
      await save(`${String(++responseCount).padStart(2, '0')}-${options.schemaName}-${response.attempt}.private.json`, {
        schemaName: options.schemaName, route: response.route, content: response.content, messages: response.messages, usage: response.usage });
      console.log(JSON.stringify({ variant: mode, phase: options.schemaName, attempt: response.attempt }));
      await options.onResponse?.(response);
    } });
  };
}
await save('experiment.private.json', { variant: mode, snapshotHash, guidanceHash, sourceStamp: snapshot.stamp });
if (!process.argv.includes('--live')) process.exit(0);
try {
  await load('@/lib/services/publish.service').generateCommunityPost(projectId, { ideaId: snapshot.pack.selectedIdea.id,
    config: snapshot.pack.config, expectedPackId: snapshot.pack.id });
  await verifyBeforeProvider();
  assert.equal(digest(JSON.parse(await readFile(snapshotFile, 'utf8'))), snapshotHash);
  await save('verification.private.json', { variant: mode, snapshotHash, guidanceHash, sourceStamp: snapshot.stamp,
    currentSourceVerified: true, sourceReads, providerRequests: requests.length, requests, responseCount, resumedStages,
    databaseWrites: 0, storageWrites: 0, appWrites: 0, deploys: 0 });
  console.log(JSON.stringify({ variant: mode, phase: 'completed', chars: saved.body.length, protocolVersion: snapshot.stamp.protocolVersion }));
} finally {
  await save('requests.private.json', { sourceReads, requests, resumedStages, responseCount });
}
