import "server-only";
import { createHash } from "node:crypto";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { extractFrames } from "./frame-extractor";
import { extractAudio } from "./audio-extractor";
import { extractSubtitles } from "./subtitles";
import { runMediaCommand } from "./ffmpeg";
import { MAX_FRAMES, MAX_VIDEO_BYTES, MediaProcessingError, timedTextSchema, videoMetadataSchema, type VideoSource } from "./media-evidence";

export const preparedVideoSchema = z.object({
  artifactId: z.string(), sourceSha256: z.string().regex(/^[a-f0-9]{64}$/), metadata: videoMetadataSchema,
  frames: z.array(z.object({ timestamp: z.number().nonnegative(), imageDataUrl: z.string().startsWith("data:image/jpeg;base64,").max(1_400_000) })).max(MAX_FRAMES),
  audioBase64: z.string().max(13_000_000).nullable(), subtitles: z.array(timedTextSchema).max(2000),
  requested: z.array(z.number()).max(MAX_FRAMES), warnings: z.array(z.string()).max(100),
}).strict();
export type PreparedVideo = z.infer<typeof preparedVideoSchema>;
const probeSchema = z.object({
  format: z.object({ duration: z.string().optional() }),
  streams: z.array(z.object({ codec_type: z.string(), codec_name: z.string().optional(), width: z.number().optional(), height: z.number().optional(),
    avg_frame_rate: z.string().optional(), r_frame_rate: z.string().optional(), duration: z.string().optional() })),
});

export function parseVideoMetadata(value: unknown, filesize: number) {
  const probe = probeSchema.parse(value);
  const video = probe.streams.find(stream => stream.codec_type === "video");
  if (!video) throw new MediaProcessingError("corrupt", "文件中没有可读取的视频轨。");
  const [n, d = "1"] = (video.avg_frame_rate || video.r_frame_rate || "0/1").split("/");
  const fps = Number(d) ? Number(n) / Number(d) : 0;
  const result = videoMetadataSchema.safeParse({ duration: Number(probe.format.duration || video.duration), width: video.width, height: video.height,
    fps, codec: video.codec_name ?? "unknown", audioTrack: probe.streams.some(s => s.codec_type === "audio"), subtitleTrack: probe.streams.some(s => s.codec_type === "subtitle"), filesize });
  if (!result.success) throw new MediaProcessingError("corrupt", "视频元数据无效或文件已损坏。");
  return result.data;
}

async function downloadVideo(source: VideoSource, target: string, signal: AbortSignal): Promise<string> {
  if (!Number.isSafeInteger(source.sizeBytes) || source.sizeBytes <= 0) throw new MediaProcessingError("unreadable", "视频文件大小无效。");
  if (source.sizeBytes > MAX_VIDEO_BYTES) throw new MediaProcessingError("resource_limit", "当前短视频工作端只接受 50 MB 以内的视频；更大文件需独立媒体工作端。");
  const file = await open(target, "wx", 0o600);
  try {
    const response = await fetch(source.url, { signal, cache: "no-store", redirect: "error" });
    if (!response.ok || !response.body) throw new MediaProcessingError("unreadable", "无法读取已上传的视频，请检查文件存储后重试。");
    const reader = response.body.getReader(); const hash = createHash("sha256"); let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.length;
        if (size > MAX_VIDEO_BYTES || size > source.sizeBytes) throw new MediaProcessingError("resource_limit", "视频下载超出声明大小或工作端上限。");
        hash.update(value); await file.writeFile(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    const digest = hash.digest("hex");
    if (size !== source.sizeBytes || source.sha256 && digest !== source.sha256) throw new MediaProcessingError("corrupt", "视频大小或 SHA-256 完整性校验失败。");
    return digest;
  } finally { await file.close(); }
}

/** Pure processing port: no DB, vendor or HTTP route dependency; movable to a separate Node worker. */
export interface VideoPreprocessor { preprocess(source: VideoSource): Promise<PreparedVideo> }
export const localVideoPreprocessor: VideoPreprocessor = {
  async preprocess(source) {
    const directory = await mkdtemp(join(tmpdir(), "benchmark-media-"));
    let signal = AbortSignal.timeout(120_000);
    try {
      const input = join(directory, "source.video");
      console.info("[media] downloading video", { bytes: source.sizeBytes });
      const sourceSha256 = await downloadVideo(source, input, signal);
      // Storage transfer and CPU decoding have separate bounded budgets. A slow
      // 47 MB download must not consume the whole decoding window.
      signal = AbortSignal.timeout(60_000);
      console.info("[media] probing video");
      const probe = await runMediaCommand("ffprobe", ["-v", "error", "-protocol_whitelist", "file,pipe", "-format_whitelist", "mov,matroska,webm,avi", "-show_format", "-show_streams", "-of", "json", input], signal);
      const metadata = parseVideoMetadata(JSON.parse(probe), source.sizeBytes);
      const { frames, requested, warnings } = await extractFrames(input, directory, metadata, signal);
      const audio = await extractAudio(input, directory, metadata, signal);
      const subtitle = await extractSubtitles(input, metadata, signal);
      return preparedVideoSchema.parse({ artifactId: source.artifactId, sourceSha256, metadata,
        frames: frames.map(({ timestamp, imageDataUrl }) => ({ timestamp, imageDataUrl })), audioBase64: audio.audioBase64,
        subtitles: subtitle.subtitles, requested, warnings: [...warnings, ...audio.warnings, ...subtitle.warnings,
          ...(metadata.duration > 48 ? ["long_video_sparse_sampling"] : [])] });
    } catch (error) {
      if (error instanceof MediaProcessingError) throw error;
      throw new MediaProcessingError(signal.aborted ? "timeout" : "corrupt", signal.aborted ? "视频预处理超时，请重试或使用独立媒体工作端。" : "视频无法读取或解码，请核对原始文件。");
    } finally { await rm(directory, { recursive: true, force: true }); }
  },
};
