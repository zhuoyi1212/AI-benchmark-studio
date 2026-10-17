import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { MAX_FRAMES, type VideoMetadata } from "./media-evidence";
import { runMediaCommand } from "./ffmpeg";

export type ExtractedFrame = { timestamp: number; imagePath: string; imageDataUrl: string };

export function sampleFrameTimestamps(duration: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Invalid video duration");
  // End just before EOF, where a decoded frame actually exists.
  const end = Math.max(0, duration - Math.min(0.2, duration / 10));
  const count = Math.min(MAX_FRAMES, Math.max(2, Math.ceil(duration / 4) + 1));
  return [...new Set(Array.from({ length: count }, (_, i) => Number((end * i / (count - 1)).toFixed(3))))];
}

export async function extractFrames(inputPath: string, directory: string, metadata: VideoMetadata, signal: AbortSignal) {
  const requested = sampleFrameTimestamps(metadata.duration);
  console.info(`[media] extracting ${requested.length} frames`);
  const frames: ExtractedFrame[] = []; const warnings: string[] = [];
  // A single decoder per frame, sequentially, caps RAM/CPU even for 4K sources.
  for (const [i, timestamp] of requested.entries()) {
    if (signal.aborted) { warnings.push("frame_extraction_timeout"); break; }
    const imagePath = join(directory, `frame-${i}.jpg`);
    try {
      await runMediaCommand("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-threads", "1", "-protocol_whitelist", "file,pipe", "-format_whitelist", "mov,matroska,webm,avi", "-ss", String(timestamp), "-i", inputPath,
        "-frames:v", "1", "-vf", "scale=w='min(960,iw)':h=-2", "-q:v", "3", "-threads", "1", "-y", imagePath], signal);
      const image = await readFile(imagePath);
      if (image.length > 1_000_000 || image.length === 0) throw new Error("Invalid extracted frame");
      frames.push({ timestamp, imagePath, imageDataUrl: `data:image/jpeg;base64,${image.toString("base64")}` });
    } catch { warnings.push(`frame_extraction_failed:${timestamp}`); }
  }
  return { frames, requested, warnings };
}
