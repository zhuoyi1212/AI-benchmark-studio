import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { MAX_AUDIO_SECONDS, type VideoMetadata } from "./media-evidence";
import { runMediaCommand } from "./ffmpeg";

export async function extractAudio(inputPath: string, directory: string, metadata: VideoMetadata, signal: AbortSignal): Promise<{ audioBase64: string | null; warnings: string[] }> {
  if (!metadata.audioTrack) return { audioBase64: null, warnings: [] };
  if (metadata.duration > MAX_AUDIO_SECONDS) return { audioBase64: null, warnings: ["audio_extraction_skipped_duration_limit"] };
  console.info("[media] extracting audio");
  try {
    const output = join(directory, "audio.wav");
    await runMediaCommand("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-threads", "1", "-protocol_whitelist", "file,pipe", "-format_whitelist", "mov,matroska,webm,avi", "-i", inputPath,
      "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", "-t", String(MAX_AUDIO_SECONDS), "-y", output], signal);
    const bytes = await readFile(output);
    if (bytes.length > MAX_AUDIO_SECONDS * 32000 + 4096) throw new Error("Audio limit exceeded");
    return { audioBase64: bytes.toString("base64"), warnings: [] };
  } catch { return { audioBase64: null, warnings: ["audio_extraction_failed"] }; }
}
