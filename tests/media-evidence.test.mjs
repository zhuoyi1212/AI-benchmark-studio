import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import * as fsPromises from 'node:fs/promises';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpeg from 'ffmpeg-static';
import createLoader from '../scripts/lib/load-typescript.cjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const load = createLoader(root);
const { localVideoPreprocessor, parseVideoMetadata } = load('@/lib/media/video-preprocessor');
const { sampleFrameTimestamps } = load('@/lib/media/frame-extractor');
const { createVideoEvidenceService, mediaEvidenceText } = load('@/lib/media/video-evidence');
const { parseSubtitleText } = load('@/lib/media/subtitles');
const { transcribeAudio } = load('@/lib/media/transcript');
const { mediaEvidenceSchema, MAX_VIDEO_BYTES } = load('@/lib/media/media-evidence');
const directory = await mkdtemp(join(tmpdir(), 'video-test-fixtures-'));
after(() => rm(directory, { recursive: true, force: true }));
const run = promisify(execFile);
async function fixture(name, audio, subtitle = false) {
  const path = join(directory, name);
  const args = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=10'];
  if (audio) args.push('-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=44100');
  if (subtitle) {
    const text = join(directory, 'sample.srt');
    await writeFile(text, '1\n00:00:00,000 --> 00:00:01,000\nFixture caption\n\n2\n00:00:01,100 --> 00:00:01,900\nSecond caption\n');
    args.push('-i', text, '-c:s', 'mov_text');
  }
  args.push('-t', '2', '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p');
  if (audio) args.push('-c:a', 'aac');
  args.push('-y', path);
  await run(ffmpeg, args, { timeout: 20000 });
  return readFile(path);
}
const withAudio = await fixture('audio.mp4', true);
const noAudio = await fixture('silent.mp4', false);
const withSubtitles = await fixture('subtitles.mp4', true, true);
function source(bytes) { return { artifactId: 'test-artifact', url: 'https://fixture.invalid/source.mp4', sizeBytes: bytes.length }; }
async function prepare(t, bytes) {
  t.mock.method(globalThis, 'fetch', async () => new Response(bytes));
  return localVideoPreprocessor.preprocess(source(bytes));
}
const prepared = {
  artifactId: 'test-artifact', sourceSha256: 'a'.repeat(64), metadata: { duration: 2, width: 160, height: 90, fps: 10, codec: 'h264', audioTrack: true, subtitleTrack: false, filesize: 100 },
  frames: [{ timestamp: 0, imageDataUrl: 'data:image/jpeg;base64,Zml4dHVyZQ==' }, { timestamp: 1.8, imageDataUrl: 'data:image/jpeg;base64,Zml4dHVyZQ==' }],
  requested: [0, 1.8], audioBase64: 'Zml4dHVyZQ==', subtitles: [], warnings: [],
};
const usage = { inputTokens: 1, outputTokens: 1, latencyMs: 1, estimatedCost: null };
const observation = timestamp => ({ timestamp, sceneDescription: 'fixture scene', visibleText: ['fixture'], productMention: [], uiElement: [], obviousIssue: null, relevanceToInput: 'fixture relevance' });
function service(options = {}) {
  const store = new Map(); const calls = { preprocessing: 0, vision: 0, asr: 0 };
  const defaults = {
    preprocessor: { preprocess: async () => { calls.preprocessing++; return structuredClone(options.prepared ?? prepared); } },
    vision: { analyze: async frames => { calls.vision++; return { frames: frames.map(f => observation(f.timestamp)), usage, inputSignature: 'fixture' }; } },
    asr: { name: 'fixture-asr', model: 'fixture', transcribe: async () => { calls.asr++; return { fullText: 'fixture voice', segments: [{ start: 0, end: 1, text: 'fixture voice' }] }; } },
    cache: { read: async key => store.get(key), write: async (key, value) => { store.set(key, structuredClone(value)); } },
  };
  return { analyze: createVideoEvidenceService({ ...defaults, ...options }), store, calls };
}

test('real normal MP4 probes and extracts bounded JPEGs plus mono 16kHz WAV', async t => {
  const result = await prepare(t, withAudio);
  assert.equal(result.metadata.width, 160); assert.equal(result.metadata.height, 90); assert.equal(result.metadata.fps, 10);
  assert.equal(result.metadata.audioTrack, true); assert.equal(result.metadata.filesize, withAudio.length);
  assert.equal(result.frames.length, 2); assert.ok(result.frames.every(f => f.imageDataUrl.startsWith('data:image/jpeg;base64,/9j/')));
  const wav = Buffer.from(result.audioBase64, 'base64');
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.readUInt16LE(22), 1); assert.equal(wav.readUInt32LE(24), 16000);
});
test('real video without audio remains analyzable and ASR is never called', async t => {
  const result = await prepare(t, noAudio);
  assert.equal(result.metadata.audioTrack, false); assert.equal(result.audioBase64, null);
  const h = service({ prepared: result }); const evidence = await h.analyze(source(noAudio));
  assert.equal(evidence.transcript.status, 'no_audio'); assert.equal(h.calls.asr, 0); assert.equal(evidence.frames.length, 2);
});
test('no subtitle track is normal and does not add a failure warning', async t => {
  const result = await prepare(t, withAudio);
  assert.equal(result.metadata.subtitleTrack, false); assert.deepEqual(result.subtitles, []);
  assert.equal(result.warnings.some(w => w.includes('subtitle')), false);
});
test('real embedded subtitle track is extracted with timestamps and original text', async t => {
  const result = await prepare(t, withSubtitles);
  assert.equal(result.metadata.subtitleTrack, true);
  assert.deepEqual(result.subtitles.map(s => s.text), ['Fixture caption', 'Second caption']);
  assert.equal(result.subtitles[1].start, 1.1); assert.equal(result.subtitles[1].end, 1.9);
});
test('ASR failure or malformed output preserves usable visual evidence', async () => {
  for (const transcribe of [async () => { throw new Error('provider down'); }, async () => ({ fullText: 42, segments: [] })]) {
    const h = service({ asr: { name: 'fixture', model: 'fixture', transcribe } });
    const evidence = await h.analyze({ artifactId: prepared.artifactId, sizeBytes: 100, url: 'https://fixture.invalid' });
    assert.equal(evidence.transcript.status, 'failed'); assert.equal(evidence.frames.length, 2);
    assert.ok(evidence.warnings.includes('speech_transcription_failed'));
  }
});
test('ASR unavailable or timed out is explicit and never invents a transcript', async () => {
  const h = service({ asr: null }); const evidence = await h.analyze({ artifactId: prepared.artifactId, sizeBytes: 100, url: 'https://fixture.invalid' });
  assert.equal(evidence.transcript.status, 'unavailable'); assert.equal(evidence.transcript.fullText, '');
  const controller = new AbortController();
  const operation = transcribeAudio(prepared.audioBase64, true, { name: 'fixture', model: 'fixture', transcribe: () => new Promise(() => {}) }, controller.signal);
  controller.abort(); assert.equal((await operation).transcript.status, 'failed');
});
test('bad batch and one bad vision frame do not discard the other frame or audio', async () => {
  const h = service({ vision: { analyze: async frames => {
    if (frames.length > 1 || frames[0].timestamp === 0) throw new Error('one unreadable frame');
    return { frames: [observation(frames[0].timestamp)], usage, inputSignature: 'fixture' };
  } } });
  const evidence = await h.analyze({ artifactId: prepared.artifactId, sizeBytes: 100, url: 'https://fixture.invalid' });
  assert.deepEqual(evidence.frames.map(f => f.timestamp), [1.8]); assert.equal(evidence.transcript.status, 'completed');
  assert.ok(evidence.warnings.includes('vision_frame_failed:0'));
});
test('all vision requests failing can still use subtitle or completed transcript evidence', async () => {
  const fail = { analyze: async () => { throw new Error('vision down'); } };
  const audio = await service({ vision: fail }).analyze({ artifactId: prepared.artifactId, sizeBytes: 100, url: 'https://fixture.invalid' });
  assert.equal(audio.frames.length, 0); assert.equal(audio.transcript.status, 'completed');
  const text = await service({ vision: fail, asr: null, prepared: { ...prepared, subtitles: [{ start: 0, end: 1, text: 'real subtitle' }] } }).analyze({ artifactId: prepared.artifactId, sizeBytes: 100, url: 'https://fixture.invalid' });
  assert.equal(text.subtitles.length, 1);
  await assert.rejects(service({ vision: fail, asr: null }).analyze({ artifactId: prepared.artifactId, sizeBytes: 100, url: 'https://fixture.invalid' }), error => error.code === 'no_evidence');
});
test('ffprobe cannot start: actionable runtime failure, no fake analysis, temp files cleaned', async t => {
  const ownedDirectories = [];
  const isolated = createLoader(root, { 'node:fs/promises': { ...fsPromises,
    mkdtemp: async prefix => { const path = await mkdtemp(prefix); ownedDirectories.push(path); return path; },
  } })('@/lib/media/video-preprocessor').localVideoPreprocessor;
  t.mock.method(globalThis, 'fetch', async () => new Response(withAudio));
  const previous = process.env.FFPROBE_PATH; process.env.FFPROBE_PATH = join(directory, 'missing-binary');
  try { await assert.rejects(isolated.preprocess(source(withAudio)), error => error.code === 'runtime_unavailable'); }
  finally { if (previous) process.env.FFPROBE_PATH = previous; else delete process.env.FFPROBE_PATH; }
  assert.equal(ownedDirectories.length, 1);
  for (const path of ownedDirectories) await assert.rejects(fsPromises.stat(path), { code: 'ENOENT' });
});
test('corrupt MP4 and source integrity mismatch fail without retained temp files', async t => {
  const bytes = Buffer.from('not an MP4'); t.mock.method(globalThis, 'fetch', async () => new Response(bytes));
  await assert.rejects(localVideoPreprocessor.preprocess(source(bytes)), error => error.code === 'corrupt');
  await assert.rejects(localVideoPreprocessor.preprocess({ ...source(bytes), sha256: 'b'.repeat(64) }), /完整性/);
});
test('long video samples start, middle and end within 12 frames instead of truncating the beginning', async () => {
  for (const duration of [0.01, 2, 30, 60, 300, 7200]) {
    const times = sampleFrameTimestamps(duration); assert.ok(times.length <= 12); assert.equal(times[0], 0); assert.ok(times.at(-1) < duration);
    assert.ok(times.at(-1) >= duration * 0.8); assert.equal(new Set(times).size, times.length);
    if (duration >= 30) assert.ok(times.some(t => Math.abs(t - duration / 2) <= duration / 10));
  }
  const h = service({ prepared: { ...prepared, metadata: { ...prepared.metadata, duration: 7200 }, audioBase64: null, warnings: ['long_video_sparse_sampling', 'audio_extraction_skipped_duration_limit'] } });
  const evidence = await h.analyze({ artifactId: prepared.artifactId, sizeBytes: 100, url: 'https://fixture.invalid' });
  assert.equal(evidence.transcript.status, 'skipped'); assert.equal(evidence.frames.length, 2); assert.ok(evidence.warnings.includes('long_video_sparse_sampling'));
});
test('oversized or dishonest video is rejected before unbounded download/ffmpeg allocation', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(withAudio));
  await assert.rejects(localVideoPreprocessor.preprocess({ ...source(withAudio), sizeBytes: MAX_VIDEO_BYTES + 1 }), error => error.code === 'resource_limit');
  assert.equal(fetch.mock.callCount(), 0);
  await assert.rejects(localVideoPreprocessor.preprocess({ ...source(withAudio), sizeBytes: 1 }), error => error.code === 'resource_limit');
});
test('same video reuses persistent evidence despite signed URL expiry; changed task only reanalyzes cached frames', async () => {
  const h = service(); const input = { artifactId: prepared.artifactId, sizeBytes: 100, url: 'https://fixture.invalid?token=old' };
  const first = await h.analyze(input, { prompt: 'task' }); const second = await h.analyze({ ...input, url: 'https://fixture.invalid?token=new' }, { prompt: 'task' });
  assert.deepEqual(first, second); assert.equal(h.calls.preprocessing, 1); assert.equal(h.calls.vision, 1);
  await h.analyze(input, { prompt: 'new task' }); assert.equal(h.calls.preprocessing, 1); assert.equal(h.calls.vision, 2);
  assert.doesNotMatch(JSON.stringify([...h.store]), /token=|imagePath|source\.mp4/);
});
test('cache unavailable is a warning, not an analysis failure; evidence schema still validates', async () => {
  const h = service({ cache: { read: async () => { throw new Error('storage down'); }, write: async () => { throw new Error('storage down'); } } });
  const evidence = await h.analyze({ artifactId: prepared.artifactId, sizeBytes: 100, url: 'https://fixture.invalid' });
  assert.equal(mediaEvidenceSchema.safeParse(evidence).success, true); assert.ok(evidence.warnings.includes('media_cache_read_failed'));
  assert.match(mediaEvidenceText(evidence), /ASR 未完成时不能评价配音质量/);
});
test('subtitle SRT/VTT parser and invalid metadata do not turn partial or corrupt input into facts', () => {
  assert.deepEqual(parseSubtitleText('WEBVTT\n\n00:01.000 --> 00:02.500\n<b>字幕</b>\n'), [{ start: 1, end: 2.5, text: '字幕' }]);
  assert.throws(() => parseVideoMetadata({ format: { duration: 'NaN' }, streams: [{ codec_type: 'video', width: 10, height: 10 }] }, 100), /损坏/);
});

test('ffmpeg extraction failure preserves metadata and explicit warnings; no fake usable content', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(withAudio));
  const previous = process.env.FFMPEG_PATH; process.env.FFMPEG_PATH = join(directory, 'missing-ffmpeg');
  try {
    const result = await localVideoPreprocessor.preprocess(source(withAudio));
    assert.equal(result.metadata.audioTrack, true); assert.equal(result.frames.length, 0); assert.equal(result.audioBase64, null);
    assert.ok(result.warnings.includes('audio_extraction_failed')); assert.ok(result.warnings.some(w => w.startsWith('frame_extraction_failed:')));
    await assert.rejects(service({ prepared: result, asr: null }).analyze(source(withAudio)), error => error.code === 'no_evidence');
  } finally { if (previous) process.env.FFMPEG_PATH = previous; else delete process.env.FFMPEG_PATH; }
});

test('degraded evidence is reused across phases without disguising warnings as complete', async () => {
  let visionCalls = 0;
  const h = service({ vision: { analyze: async frames => { visionCalls++; return { frames: [observation(frames.at(-1).timestamp)], usage, inputSignature: 'partial' }; } } });
  const input = { artifactId: prepared.artifactId, sizeBytes: 100, url: 'https://fixture.invalid' };
  const first = await h.analyze(input); const second = await h.analyze(input);
  assert.deepEqual(first, second); assert.equal(visionCalls, 1); assert.ok(second.warnings.includes('vision_frame_failed:0'));
  assert.ok([...h.store.keys()].some(k => k.includes('-partial-')));
});
