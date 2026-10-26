import "server-only";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runMediaCommand } from "./ffmpeg";
import { localVideoPreprocessor } from "./video-preprocessor";
import { prepareAnalysisImage } from "./analysis-image";

/** Small synthetic fixture only; never accepts user URLs or returns machine paths. */
export async function verifyMediaRuntime() {
  const signal = AbortSignal.timeout(20_000);
  const versions = {} as Record<"ffmpeg" | "ffprobe", string>;
  for (const kind of ["ffmpeg", "ffprobe"] as const) versions[kind] = (await runMediaCommand(kind, ["-version"], signal, 20_000)).split("\n")[0];
  const directory = await mkdtemp(join(tmpdir(), "benchmark-media-health-"));
  try {
    const file = join(directory, "fixture.mp4");
    await runMediaCommand("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=blue:s=160x90:r=10", "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=44100", "-t", "0.4", "-c:v", "libx264", "-threads", "1", "-c:a", "aac", "-y", file], signal);
    const bytes = await readFile(file);
    const prepared = await localVideoPreprocessor.preprocess({ artifactId: "runtime-self-test", sizeBytes: bytes.length, url: `data:video/mp4;base64,${bytes.toString("base64")}` });
    const wav = Buffer.from(prepared.audioBase64 ?? "", "base64");
    const audioHz = wav.length > 28 ? wav.readUInt32LE(24) : 0;
    const audioChannels = wav.length > 24 ? wav.readUInt16LE(22) : 0;
    if (!prepared.frames.length || audioHz !== 16000 || audioChannels !== 1) throw new Error("Media runtime self-test failed");
    const image = await prepareAnalysisImage(Buffer.from(prepared.frames[0].imageDataUrl.split(",")[1], "base64"), "image/jpeg");
    return { ok: true, platform: process.platform, architecture: process.arch, node: process.version, versions, decodedFrames: prepared.frames.length, audioHz, audioChannels,
      analysisImage: { ok: true, width: image.manifest.width, height: image.manifest.height, bytes: image.bytes.length } };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
