import "server-only";
import { z } from "zod";
import { timedTextSchema, type Transcript } from "./media-evidence";

export interface ASRProvider {
  readonly name: string;
  readonly model: string;
  transcribe(input: { audio: Buffer; mimeType: "audio/wav"; signal: AbortSignal }): Promise<{ fullText: string; segments: Array<{ start: number; end: number; text: string }> }>;
}
export const asrOutputSchema = z.object({ fullText: z.string().trim().min(1).max(40000), segments: z.array(timedTextSchema).max(2000) }).strict();

/** No existing ASR service is configured. Installing a provider is an explicit server composition choice, never a model guess. */
export const defaultASRProvider: ASRProvider | null = null;

export async function transcribeAudio(audioBase64: string | null, audioTrack: boolean, provider: ASRProvider | null, signal: AbortSignal): Promise<{ transcript: Transcript; warnings: string[] }> {
  const empty = (status: Transcript["status"], warnings: string[] = []) => ({ transcript: { status, fullText: "", segments: [] }, warnings });
  if (!audioTrack) return empty("no_audio");
  if (!audioBase64) return empty("skipped");
  if (!provider) return empty("unavailable", ["speech_transcription_unavailable"]);
  console.info("[media] transcribing audio");
  // Abort also bounds adapters that do not correctly honor the input signal.
  let onAbort: (() => void) | undefined;
  try {
    signal.throwIfAborted();
    const timeout = new Promise<never>((_, reject) => {
      onAbort = () => reject(new Error("ASR timeout")); signal.addEventListener("abort", onAbort, { once: true });
    });
    const data = asrOutputSchema.parse(await Promise.race([provider.transcribe({ audio: Buffer.from(audioBase64, "base64"), mimeType: "audio/wav", signal }), timeout]));
    return { transcript: { status: "completed", ...data }, warnings: [] };
  } catch { return empty("failed", ["speech_transcription_failed"]); }
  finally { if (onAbort) signal.removeEventListener("abort", onAbort); }
}
