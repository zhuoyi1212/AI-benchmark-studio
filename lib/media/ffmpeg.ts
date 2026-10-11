import "server-only";
import { spawn } from "node:child_process";
import ffmpeg from "ffmpeg-static";
import ffprobe from "@ffprobe-installer/ffprobe";
import { MediaProcessingError } from "./media-evidence";

export function mediaBinary(kind: "ffmpeg" | "ffprobe"): string {
  const path = kind === "ffmpeg" ? process.env.FFMPEG_PATH || ffmpeg : process.env.FFPROBE_PATH || ffprobe.path;
  if (!path) throw new MediaProcessingError("runtime_unavailable", "视频处理工具不可用，请检查服务器 FFmpeg 配置。");
  return path;
}

/** Never invoke a shell, log signed URLs/stderr, or allow unbounded subprocess output. */
export function runMediaCommand(kind: "ffmpeg" | "ffprobe", args: string[], signal: AbortSignal, maxOutputBytes = 1_000_000): Promise<string> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(mediaBinary(kind), args, { shell: false, stdio: ["ignore", "pipe", "ignore"] });
    const chunks: Buffer[] = []; let bytes = 0; let terminalError: Error | undefined;
    const stop = (error: Error) => { terminalError ??= error; child.kill("SIGKILL"); };
    const abort = () => stop(new MediaProcessingError("timeout", "视频预处理超时，请使用较短的视频或独立媒体工作端。"));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxOutputBytes) stop(new MediaProcessingError("resource_limit", "媒体工具输出超出安全上限。"));
      else chunks.push(chunk);
    });
    child.once("error", () => { signal.removeEventListener("abort", abort); reject(new MediaProcessingError("runtime_unavailable", "FFmpeg/FFprobe 无法启动，请检查部署二进制与执行权限。")); });
    child.once("close", code => {
      signal.removeEventListener("abort", abort);
      if (terminalError) reject(terminalError);
      else if (code !== 0) reject(new MediaProcessingError("corrupt", "视频无法解码，可能损坏或格式不受支持。"));
      else resolve(Buffer.concat(chunks).toString("utf8"));
    });
  });
}
