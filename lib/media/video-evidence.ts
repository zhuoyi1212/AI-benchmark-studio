import "server-only";
import { quickExecution, QuickYield } from "@/lib/quick/checkpoints";
import { quickJobsRepository } from "@/lib/repositories/quick-jobs.repository";
import { resolveAITaskRoute } from "@/lib/ai/config";
import { createInputSignature } from "@/lib/signatures";
import { mediaEvidenceRepository, type MediaCache } from "@/lib/repositories/media-evidence.repository";
import { mediaEvidenceSchema, mediaPolicyVersion, MediaProcessingError, videoEvaluationRules, type MediaEvidence, type VideoSource } from "./media-evidence";
import { localVideoPreprocessor, preparedVideoSchema, type VideoPreprocessor } from "./video-preprocessor";
import { analyzeFrames, defaultFrameAnalyzer, type FrameAnalyzer } from "./frame-analyzer";
import { defaultASRProvider, transcribeAudio, type ASRProvider } from "./transcript";

export type MediaDependencies = { preprocessor: VideoPreprocessor; vision: FrameAnalyzer; asr: ASRProvider | null; cache: MediaCache };
export function createVideoEvidenceService(dependencies: MediaDependencies) {
  return async (source: VideoSource, context: { prompt?: string; objective?: string; auxiliaryEvidenceAvailable?: boolean } = {}): Promise<MediaEvidence> => {
    const normalizedContext = { prompt: context.prompt ?? "", objective: context.objective ?? "" };
    const route = resolveAITaskRoute("video_frame_analysis");
    const sourceKey = `${source.artifactId}/${createInputSignature({ artifactId: source.artifactId, sizeBytes: source.sizeBytes, sha256: source.sha256 ?? null, policyVersion: mediaPolicyVersion })}`;
    const signature = createInputSignature({ sourceKey, context: normalizedContext, route, asr: dependencies.asr ? { name: dependencies.asr.name, model: dependencies.asr.model } : null });
    const resultKey = `${sourceKey}/evidence-${signature}`;
    const partialKey = `${resultKey}-partial-${Math.floor(Date.now() / 600_000)}`;
    const scope = quickExecution.getStore();
    const jobResult = scope?.job.result && typeof scope.job.result === "object" && !Array.isArray(scope.job.result) ? scope.job.result : null;
    const stageKey = `media-evidence:${signature}:${typeof jobResult?.retryEpoch === "string" ? jobResult.retryEpoch : "initial"}`;
    if (scope && jobResult?.continuation === true) {
      const stage = mediaEvidenceSchema.safeParse(await quickJobsRepository.readStep(scope.job.id, stageKey));
      if (stage.success && stage.data.artifactId === source.artifactId && stage.data.analysis.inputSignature === signature) return stage.data;
    }
    const warnings: string[] = [];
    const read = async (key: string) => { try { return await dependencies.cache.read(key); } catch { warnings.push("media_cache_read_failed"); return undefined; } };
    const write = async (key: string, value: unknown) => { try { await dependencies.cache.write(key, value); } catch { warnings.push("media_cache_write_failed"); } };
    const saved = mediaEvidenceSchema.safeParse(await read(resultKey));
    const matchesSource = (value: { artifactId: string; sourceSha256: string; metadata: { filesize: number } }) =>
      value.artifactId === source.artifactId && value.metadata.filesize === source.sizeBytes && (!source.sha256 || value.sourceSha256 === source.sha256);
    if (saved.success && matchesSource(saved.data) && saved.data.analysis.inputSignature === signature
      && (saved.data.frames.length || saved.data.transcript.fullText.trim() || saved.data.subtitles.length)) {
      console.info("[media] evidence cache hit"); return saved.data;
    }
    // Reuse honest, degraded evidence across Judge/Findings/Publish for at most
    // ten minutes. Explicit quick retry bypasses it; complete results have their
    // own immutable key and can supersede an earlier partial observation.
    if (typeof jobResult?.retryEpoch !== "string") {
      const partial = mediaEvidenceSchema.safeParse(await read(partialKey));
      if (partial.success && matchesSource(partial.data) && partial.data.analysis.inputSignature === signature
        && (partial.data.frames.length || partial.data.transcript.fullText.trim() || partial.data.subtitles.length)) return partial.data;
    }
    const cached = preparedVideoSchema.safeParse(await read(`${sourceKey}/prepared`));
    const preparedHit = cached.success && matchesSource(cached.data);
    if (!preparedHit && scope) {
      if ((scope.mediaPreparations ?? 0) >= 1) throw new QuickYield();
      scope.mediaPreparations = (scope.mediaPreparations ?? 0) + 1;
    }
    const prepared = preparedHit ? cached.data : await dependencies.preprocessor.preprocess(source);
    if (!preparedHit) await write(`${sourceKey}/prepared`, prepared);
    const audioKey = `${sourceKey}/transcript-${createInputSignature(dependencies.asr ? { name: dependencies.asr.name, model: dependencies.asr.model } : null)}`;
    const savedAudio = mediaEvidenceSchema.shape.transcript.safeParse(await read(audioKey));
    const audio = savedAudio.success && savedAudio.data.status === "completed"
      ? { transcript: savedAudio.data, warnings: [] }
      : await transcribeAudio(prepared.audioBase64, prepared.metadata.audioTrack, dependencies.asr, AbortSignal.timeout(30_000));
    if (audio.transcript.status === "completed" && !savedAudio.success) await write(audioKey, audio.transcript);
    const visual = await analyzeFrames(prepared, normalizedContext, dependencies.vision);
    if (!visual.frames.length && !audio.transcript.fullText.trim() && !prepared.subtitles.length) {
      if (!context.auxiliaryEvidenceAvailable) throw new MediaProcessingError("no_evidence", "视频未取得任何有效画面、字幕或转录证据；请重试媒体分析，或补充原始截图/文本。");
      warnings.push("video_content_evidence_failed_use_auxiliary_only");
    }
    console.info("[media] building evidence");
    const evidence = mediaEvidenceSchema.parse({ policyVersion: mediaPolicyVersion, artifactId: source.artifactId, sourceSha256: prepared.sourceSha256,
      metadata: prepared.metadata, frames: visual.frames, audioAvailable: prepared.metadata.audioTrack,
      transcript: audio.transcript, subtitles: prepared.subtitles, warnings: [...new Set([...prepared.warnings, ...audio.warnings, ...visual.warnings, ...warnings])],
      sampling: { requested: prepared.requested, extracted: prepared.frames.map(f => f.timestamp), strategy: "bounded-uniform.v1" },
      analysis: { provider: route.provider, model: route.model, promptVersion: route.promptVersion, inputSignature: signature,
        asrProvider: dependencies.asr?.name ?? null, asrModel: dependencies.asr?.model ?? null, createdAt: new Date().toISOString(), calls: visual.calls },
    });
    // Partial evidence is explicitly bounded, never disguised as complete.
    await write(evidence.warnings.some(w => /failed|timeout/.test(w)) ? partialKey : resultKey, evidence);
    evidence.warnings = [...new Set([...evidence.warnings, ...warnings])];
    // Only structured observations enter DB checkpoints, never JPEG/WAV bytes.
    // This also lets multi-video cases resume if private binary cache is down.
    if (scope) await quickJobsRepository.saveStep(scope.job, stageKey, JSON.parse(JSON.stringify(evidence)));
    console.info("[media] completed", { frameCount: evidence.frames.length, transcriptStatus: evidence.transcript.status, warningCount: evidence.warnings.length });
    return evidence;
  };
}
export const buildVideoEvidence = createVideoEvidenceService({ preprocessor: localVideoPreprocessor, vision: defaultFrameAnalyzer, asr: defaultASRProvider, cache: mediaEvidenceRepository });
export function mediaEvidenceText(evidence: MediaEvidence) {
  // Audit telemetry stays in the cache, not the evaluator's input. Otherwise a
  // fresh timestamp on a partial-evidence retry invalidates every AI checkpoint.
  const provenance = { provider: evidence.analysis.provider, model: evidence.analysis.model, promptVersion: evidence.analysis.promptVersion,
    inputSignature: evidence.analysis.inputSignature, asrProvider: evidence.analysis.asrProvider, asrModel: evidence.analysis.asrModel };
  return `${videoEvaluationRules}\nMediaEvidence (original artifactId: ${evidence.artifactId}):\n${JSON.stringify({ ...evidence, analysis: provenance })}`;
}
