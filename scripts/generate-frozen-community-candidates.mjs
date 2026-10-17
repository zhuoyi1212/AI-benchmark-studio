/** Replay archived real inputs through the production pipeline, with filesystem-only output. */
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const createLoader = require('./lib/load-typescript.cjs');
const key = process.argv[2];
assert.ok(['jimeng', 'dongni', 'metaso'].includes(key), 'Choose an already authorized frozen project');
assert.ok(!process.env.AI_E2E_PROVIDER_BASE_URL && !process.env.E2E_TEST_MODE);
const frozenDir = path.join(root, 'outputs/reader-candidates-private', key);
const output = path.resolve(process.argv[3] ?? path.join(root, 'outputs/natural-voice-private', key, new Date().toISOString().replace(/[:.]/g, '-')));
assert.ok(output.startsWith(path.join(root, 'outputs/natural-voice-private/')));
await mkdir(output, { recursive: true, mode: 0o700 });
const save = (name, value) => writeFile(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const baseline = JSON.parse(await readFile(path.join(frozenDir, 'baseline.private.json'), 'utf8'));
assert.equal(digest(baseline.source), baseline.sourceHash);
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
// All three archived inputs already include original text / recorded Z.AI observations.
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
    humanConfirmedAt: 'confirmed-in-archived-production-source', effectiveOutput: source.facts },
};
let row = { id: workspace.pack.id, version: workspace.pack.version, status: 'ready',
  content_ideas: workspace.pack.ideas, selected_idea: workspace.pack.selectedIdea,
  config: workspace.pack.config, community_post: workspace.pack.post };
const localId = randomUUID();
const localOnly = id => assert.equal(id, localId);
let saved;
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
    await save('candidate.private.json', { generatedAt: new Date().toISOString(), key, projectId: source.projectId,
      sourcePackId: workspace.pack.id, sourceVersion: workspace.pack.version, sourceHash: baseline.sourceHash,
      frozenRawHash: digest(rawEvidence), mode: 'frozen real input, local candidate only', post, usage });
  },
  fail: async (id, message) => { localOnly(id); await save('failure.private.json', { message }); },
};
const forbidden = () => { throw Error('Frozen replay forbids this database/read path'); };
const load = createLoader(root, {
  '@/lib/repositories/publish.repository': { publishRepository: localRepository },
  '@/lib/services/findings.service': { getExperienceFindingsWorkspace: async id => { assert.equal(id, source.projectId); return quick; }, buildRawFindingsEvidenceContent: async (id, options) => {
    assert.equal(id, source.projectId); assert.deepEqual([...options.artifactIds].sort(), source.artifactIds); return structuredClone(rawEvidence);
  } },
  '@/lib/services/research.service': { getResearchWorkspace: async () => ({ completedResult: { products: snapshot.research } }) },
  '@/lib/services/report.service': { getReportWorkspace: forbidden },
  '@/lib/repositories/result-analysis.repository': { resultAnalysisRepository: { getById: forbidden } },
});
const allowedHosts = new Set(['api.moonshot.cn', 'api.deepseek.com', 'api.z.ai']);
const originalFetch = globalThis.fetch;
let providerRequests = 0;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  assert.equal(url.protocol, 'https:'); assert.ok(allowedHosts.has(url.hostname), 'No DB/Storage or other destination is permitted');
  assert.equal(method, 'POST'); providerRequests++;
  return originalFetch(input, init);
};
const ai = load('@/lib/ai/task-service').aiTaskService;
let responseCount = 0;
const reuseArg = process.argv.indexOf('--reuse');
const reuse = reuseArg < 0 ? null : path.resolve(process.argv[reuseArg + 1]);
if (reuse) assert.ok(reuse.startsWith(path.join(root, 'outputs/natural-voice-private', key) + path.sep));
const reusedStages = [];
for (const name of ['discoverContentIdeas', 'generateCommunityPost', 'humanizeCommunityPost', 'factCheckTextCommunityPost', 'factCheckCommunityPost']) {
  const execute = ai[name];
  ai[name] = async options => {
    if (options.schemaName === 'CommunityStoryBrief') {
      const input = jsonInput(options);
      for (const field of ['config', 'products', 'tasks', 'factLedger', 'scopeNotes', 'artifactIds', 'selectedIdea', 'imageArtifacts']) assert.deepEqual(input[field], frozenPostInput[field], `Frozen ${field} must not change`);
    }
    if (options.schemaName === 'CommunityPostDraft') {
      const input = jsonInput(options);
      for (const field of ['config', 'products', 'tasks', 'factLedger', 'scopeNotes', 'originalDetails', 'authorPerspective']) assert.deepEqual(input[field], frozenWriter[field], `Frozen writer ${field} must not change`);
    }
    // Optional replay of the same real planning/draft response, never a fallback.
    // Revalidate and require identical ordered original request messages.
    if (reuse && ['CommunityStoryBrief', 'CommunityPostDraft'].includes(options.schemaName)) {
      const candidates = (await readdir(reuse)).filter(f => f.includes(`-${options.schemaName}-1.private.json`));
      for (const f of candidates) {
        const archived = JSON.parse(await readFile(path.join(reuse, f), 'utf8'));
        let index = 0;
        for (const message of archived.messages) if (JSON.stringify(message) === JSON.stringify(options.messages[index])) index++;
        assert.equal(index, options.messages.length, 'Refuse replay after a request change');
        const parsed = options.schema.safeParse(JSON.parse(archived.content));
        assert.equal(parsed.success, true, 'Refuse replay after validation changes');
        await options.beforeExecute?.(archived.route);
        reusedStages.push({ schemaName: options.schemaName, sourceAttempt: path.basename(reuse), originalResponse: f });
        await save(`${String(++responseCount).padStart(2, '0')}-${options.schemaName}-1.private.json`, { ...archived, replayed: true });
        return { data: parsed.data, route: archived.route, usage: archived.usage };
      }
      throw Error('Requested planning/draft replay is unavailable');
    }
    return execute({ ...options, onResponse: async response => {
      await save(`${String(++responseCount).padStart(2, '0')}-${options.schemaName}-${response.attempt}.private.json`, {
        schemaName: options.schemaName, route: response.route, content: response.content, messages: response.messages, usage: response.usage,
      });
      console.log(JSON.stringify({ key, phase: options.schemaName, attempt: response.attempt }));
      await options.onResponse?.(response);
    } });
  };
}
await save('frozen-input.private.json', { sourceHash: baseline.sourceHash, rawHash: digest(rawEvidence), frozenPostInput, frozenWriter });
console.log(JSON.stringify({ key, phase: 'preflight', sourceHash: baseline.sourceHash, rawHash: digest(rawEvidence), databaseRequests: 0, output }));
if (!process.argv.includes('--live')) process.exit(0);
await load('@/lib/services/publish.service').generateCommunityPost(source.projectId, {
  ideaId: workspace.pack.selectedIdea.id, customAngle: workspace.pack.selectedIdea.id === 'custom' ? workspace.pack.selectedIdea.angle : undefined,
  config: workspace.pack.config, expectedPackId: workspace.pack.id,
});
assert.equal(saved.contentPolicyVersion, 'community-story.v9-natural-voice');
assert.equal(digest(JSON.parse(await readFile(path.join(frozenDir, 'baseline.private.json'), 'utf8')).source), baseline.sourceHash);
await save('verification.private.json', { databaseRequests: 0, databaseWrites: 0, providerRequests, responseCount,
  sourceHash: baseline.sourceHash, frozenRawHash: digest(rawEvidence), frozenFieldsIdentical: true, originalArchiveUnchanged: true,
  appWrites: 0, deploys: 0, policyVersion: saved.contentPolicyVersion, reusedStages });
console.log(JSON.stringify({ key, phase: 'completed', chars: saved.body.length, policyVersion: saved.contentPolicyVersion, providerRequests, databaseRequests: 0, output }));
