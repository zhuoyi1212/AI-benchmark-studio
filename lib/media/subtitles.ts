import "server-only";
import { type TimedText, type VideoMetadata } from "./media-evidence";
import { runMediaCommand } from "./ffmpeg";

export function parseSubtitleText(text: string): TimedText[] {
  const time = (value: string) => value.split(":").reduce((total, part) => total * 60 + Number(part.replace(",", ".")), 0);
  const output: TimedText[] = [];
  for (const block of text.replace(/\r/g, "").split(/\n\s*\n/)) {
    const lines = block.split("\n");
    const i = lines.findIndex(line => /\d{2}:\d{2}(?::\d{2})?[.,]\d{3}\s*-->/.test(line));
    if (i < 0) continue;
    const match = lines[i].match(/([\d:]+[.,]\d{3})\s*-->\s*([\d:]+[.,]\d{3})/);
    if (!match) continue;
    const start = time(match[1]); const end = time(match[2]); const content = lines.slice(i + 1).join("\n").replace(/<[^>]+>/g, "").trim();
    if (content && content.length <= 4000 && Number.isFinite(start) && end >= start) output.push({ start, end, text: content });
    if (output.length > 2000) throw new Error("Subtitle limit exceeded");
  }
  return output;
}

export async function extractSubtitles(inputPath: string, metadata: VideoMetadata, signal: AbortSignal): Promise<{ subtitles: TimedText[]; warnings: string[] }> {
  if (!metadata.subtitleTrack) return { subtitles: [], warnings: [] };
  try {
    const text = await runMediaCommand("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-protocol_whitelist", "file,pipe", "-format_whitelist", "mov,matroska,webm,avi", "-i", inputPath, "-map", "0:s:0", "-f", "srt", "pipe:1"], signal, 200_000);
    const subtitles = parseSubtitleText(text);
    return { subtitles, warnings: subtitles.length ? [] : ["subtitle_extraction_empty"] };
  } catch { return { subtitles: [], warnings: ["subtitle_extraction_failed"] }; }
}
