import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import createLoader from '../scripts/lib/load-typescript.cjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const usage = { inputTokens: 1, outputTokens: 1, latencyMs: 1, estimatedCost: null };
const prepared = {
  artifactId: 'fixture', sourceSha256: 'a'.repeat(64),
  metadata: { duration: 2, width: 160, height: 90, fps: 10, codec: 'h264', audioTrack: false, subtitleTrack: false, filesize: 100 },
  frames: [0, 1.8].map(timestamp => ({ timestamp, imageDataUrl: 'data:image/jpeg;base64,Zml4dHVyZQ==' })),
  requested: [0, 1.8], audioBase64: null, subtitles: [], warnings: [],
};
const observation = timestamp => ({ timestamp, sceneDescription: 'verified frame', visibleText: ['fixture text'], productMention: [], uiElement: [], obviousIssue: null, relevanceToInput: 'task' });

test('failed optional vision calls yield, resume past bad frames, and allow explicit retry', async () => {
  const steps = new Map(), calls = []; let load;
  class Provider {
    async generateStructured(request) {
      const parts = request.messages.flatMap(m => Array.isArray(m.content) ? m.content : []);
      const timestamps = parts.filter(p => p.type === 'text' && p.text.startsWith('timestamp: ')).map(p => Number(p.text.slice(11)));
      calls.push(timestamps);
      if (timestamps.length > 1 || timestamps[0] === 0) throw new (load('@/lib/ai/errors').AIProviderError)('fixture unreadable frame', {
        provider: 'zhipu', model: 'fixture', task: request.task, category: 'bad_request', attempt: 1, timeoutMs: 1000, latencyMs: 1,
      });
      return { content: JSON.stringify({ frames: timestamps.map(observation) }), requestId: null, finishReason: 'stop', usage };
    }
  }
  load = createLoader(root, {
    '@/lib/ai/config': { resolveAITaskRoute: task => ({ task, provider: 'zhipu', model: 'fixture', promptVersion: 'fixture', capability: 'multimodal', reasoning: 'standard', repairReasoning: 'standard', timeoutMs: 1000, maxAttempts: 1 }) },
    '@/lib/env/server': { getAIProviderKey: () => 'fixture' },
    '@/lib/ai/providers/zhipu.provider': { ZhipuProvider: Provider },
    '@/lib/repositories/quick-jobs.repository': { quickJobsRepository: {
      stage: async () => {}, readStep: async (_id, key) => steps.get(key), saveStep: async (_job, key, value) => steps.set(key, value),
    } },
  });
  const { quickExecution, QuickYield } = load('@/lib/quick/checkpoints');
  const { createVideoEvidenceService } = load('@/lib/media/video-evidence');
  const { defaultFrameAnalyzer } = load('@/lib/media/frame-analyzer');
  const cache = new Map(); let preprocessing = 0;
  const analyze = createVideoEvidenceService({
    preprocessor: { preprocess: async () => { preprocessing++; return prepared; } }, vision: defaultFrameAnalyzer, asr: null,
    cache: { read: async key => cache.get(key), write: async (key, value) => cache.set(key, value) },
  });
  const job = { id: 'fixture-job', kind: 'evaluate', result: null }; let result, yields = 0;
  for (let attempt = 0; attempt < 5 && !result; attempt++) {
    try { result = await quickExecution.run({ job, retryable: true, aiCalls: 0 }, () => analyze({ artifactId: 'fixture', sizeBytes: 100, url: 'https://fixture.invalid' })); }
    catch (error) { assert.ok(error instanceof QuickYield); yields++; job.result = { continuation: true }; }
  }
  assert.ok(result, 'partial failure must not loop forever across worker invocations');
  assert.deepEqual(result.frames.map(f => f.timestamp), [1.8]); assert.equal(yields, 2);
  assert.deepEqual(calls, [[0, 1.8], [0], [1.8]]); assert.equal(preprocessing, 1);
  assert.ok(result.warnings.includes('vision_frame_failed:0'));
  assert.equal([...steps.keys()].filter(k => k.startsWith('media-degraded:')).length, 2);
  job.result = { retryEpoch: 'explicit-retry' };
  await assert.rejects(quickExecution.run({ job, retryable: true, aiCalls: 0 }, () => analyze({ artifactId: 'fixture', sizeBytes: 100, url: 'https://fixture.invalid' })), error => error instanceof QuickYield);
  assert.deepEqual(calls.at(-1), [0, 1.8], 'explicit retry should retry failed reads');
});

test('router blocks native MP4 and binary video evaluators before provider invocation', async () => {
  let count = 0;
  class Provider { async generateStructured() { count++; throw new Error('must never execute'); } }
  const load = createLoader(root, {
    '@/lib/ai/providers/zhipu.provider': { ZhipuProvider: Provider },
    '@/lib/ai/providers/deepseek.provider': { DeepSeekProvider: Provider },
    '@/lib/env/server': { getAIProviderKey: () => 'fixture', getAIModelEnvironment: () => ({ deepSeekReasoningModel: 'fixture', zhipuVisionModel: 'fixture' }) },
  });
  const { runStructuredAITask, selectJudgeTaskForCase } = load('@/lib/ai/router');
  for (const [task, part] of [
    ['video_frame_analysis', { type: 'video_url', video_url: { url: 'https://fixture.invalid/video.mp4' } }],
    ['findings', { type: 'file_url', file_url: { url: 'https://fixture.invalid/video.MP4?token=fixture' } }],
    ['judge_video_evidence', { type: 'image_url', image_url: { url: 'https://fixture.invalid/frame.jpg' } }],
  ]) await assert.rejects(runStructuredAITask(task, { schema: z.object({ ok: z.boolean() }), schemaName: 'fixture', messages: [{ role: 'user', content: [part] }] }));
  assert.equal(count, 0);
  assert.equal(selectJudgeTaskForCase('case', [{ id: 'v', testCaseId: 'case', mimeType: 'video/mp4' }, { id: 'i', testCaseId: 'case', mimeType: 'image/png' }]), 'judge_video_evidence');
  assert.equal(selectJudgeTaskForCase('case', [{ id: 'i', testCaseId: 'case', mimeType: 'image/png' }]), 'judge_multimodal');
  assert.equal(selectJudgeTaskForCase('case', [{ id: 't', testCaseId: 'case', mimeType: 'text/plain' }]), 'judge_text');
});

test('non-cooperative vision adapter is bounded and does not hang video analysis', async () => {
  const { analyzeFrames } = createLoader(root)('@/lib/media/frame-analyzer');
  const result = await analyzeFrames(prepared, { prompt: 'task', objective: 'task' }, { analyze: () => new Promise(() => {}) }, Date.now() + 10);
  assert.equal(result.frames.length, 0); assert.ok(result.warnings.includes('vision_analysis_timeout'));
});

test('partial evidence telemetry cannot invalidate evaluator checkpoints on continuation', async () => {
  const load = createLoader(root);
  const { mediaEvidenceText } = load('@/lib/media/video-evidence');
  const evidence = { ...prepared, policyVersion: 'video-evidence.v1', transcript: { status: 'failed', fullText: '', segments: [] },
    frames: [observation(1.8)], audioAvailable: false, sampling: { requested: [0, 1.8], extracted: [0, 1.8], strategy: 'bounded-uniform.v1' },
    warnings: ['vision_frame_failed:0'], analysis: { provider: 'fixture', model: 'fixture', promptVersion: 'fixture', inputSignature: 'same-input',
      asrProvider: null, asrModel: null, createdAt: '2026-10-11T00:00:00Z', calls: [{ inputSignature: 'same', timestamps: [1.8], usage }] } };
  assert.equal(mediaEvidenceText(evidence), mediaEvidenceText({ ...evidence, analysis: { ...evidence.analysis, createdAt: '2026-10-11T00:01:00Z', calls: [{ ...evidence.analysis.calls[0], usage: { ...usage, latencyMs: 999 } }] } }));
  assert.match(mediaEvidenceText(evidence), /vision_frame_failed:0/);
  assert.doesNotMatch(mediaEvidenceText(evidence), /createdAt|latencyMs/);
});

test('runtime diagnostic performs real encode, probe, JPEG extraction and mono WAV decoding', async () => {
  const { verifyMediaRuntime } = createLoader(root)('@/lib/media/runtime-check');
  const result = await verifyMediaRuntime();
  assert.equal(result.ok, true); assert.ok(result.decodedFrames > 0); assert.equal(result.audioHz, 16000); assert.equal(result.audioChannels, 1);
  assert.match(result.versions.ffmpeg, /^ffmpeg version/); assert.doesNotMatch(JSON.stringify(result), /imagePath|data:|\/private\/|\.env/);
});

test('missing native package metadata cannot crash module loading and returns a controlled API failure', async () => {
  const unavailable = new Proxy({}, { get() { throw new Error("Cannot find module '@ffprobe-installer/linux-x64/package.json'"); } });
  const load = createLoader(root, { '@ffprobe-installer/ffprobe': unavailable });
  const { mediaBinary } = load('@/lib/media/ffmpeg');
  await assert.rejects(mediaBinary('ffprobe'), error => error.code === 'runtime_unavailable');
  const route = load('@/app/api/media/runtime/route');
  const response = await route.GET();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, error: 'FFmpeg/FFprobe runtime verification failed' });
});

test('production global workers cannot claim reserved E2E fixtures', async () => {
  const { readFile } = await import('node:fs/promises');
  const migration = await readFile(new URL('../supabase/migrations/20261011153000_isolate_quick_e2e_workers.sql', import.meta.url), 'utf8');
  assert.match(migration, /p_project_id is not null or p.name not like '\[E2E\]%'/);
  assert.match(migration, /for update of j skip locked/);
  assert.match(migration, /lease_until = now\(\) \+ interval '15 minutes'/);
  assert.doesNotMatch(migration, /drop|delete from|truncate/i);
});

test('three videos resume with one decoder per invocation even when binary Storage cache is down', async () => {
  const steps = new Map(); let decoded = 0;
  const load = createLoader(root, { '@/lib/repositories/quick-jobs.repository': { quickJobsRepository: {
    readStep: async (_job, key) => steps.get(key), saveStep: async (_job, key, value) => steps.set(key, value), stage: async () => {},
  } } });
  const { quickExecution, QuickYield } = load('@/lib/quick/checkpoints');
  const { createVideoEvidenceService } = load('@/lib/media/video-evidence');
  const analyze = createVideoEvidenceService({
    preprocessor: { preprocess: async source => { decoded++; return { ...prepared, artifactId: source.artifactId }; } },
    vision: { analyze: async frames => ({ frames: frames.map(f => observation(f.timestamp)), usage, inputSignature: 'fixture' }) }, asr: null,
    cache: { read: async () => { throw new Error('Storage down'); }, write: async () => { throw new Error('Storage down'); } },
  });
  const sources = [1, 2, 3].map(id => ({ artifactId: `fixture-${id}`, sizeBytes: 100, url: 'https://fixture.invalid' }));
  const job = { id: 'multi', kind: 'evaluate', result: null }; let result;
  for (let invocation = 0; invocation < 4 && !result; invocation++) {
    try { result = await quickExecution.run({ job, aiCalls: 0, retryable: true }, async () => { const output = []; for (const source of sources) output.push(await analyze(source)); return output; }); }
    catch (error) { assert.ok(error instanceof QuickYield); job.result = { continuation: true }; }
  }
  assert.equal(result.length, 3); assert.equal(decoded, 3);
  assert.ok(result.every(e => e.warnings.includes('media_cache_write_failed')));
  assert.ok([...steps.values()].every(e => !JSON.stringify(e).includes('imageDataUrl') && !JSON.stringify(e).includes('audioBase64')));
});
