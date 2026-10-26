import "server-only";
import { spawn } from "node:child_process";
import { MediaProcessingError } from "./media-evidence";

export async function mediaBinary(kind: "ffmpeg" | "ffprobe"): Promise<string> {
  // Native package initialization can itself fail in a trimmed function bundle.
  // Keep it inside the operation, so unrelated pages can load and API handlers
  // can return an actionable error instead of crashing during module import.
  try {
    const path = kind === "ffmpeg"
      ? process.env.FFMPEG_PATH || (await import("ffmpeg-static")).default
      : process.env.FFPROBE_PATH || (await import("@ffprobe-installer/ffprobe")).default.path;
    if (!path) throw new Error("Missing media executable");
    return path;
  } catch { throw new MediaProcessingError("runtime_unavailable", "视频处理工具无法加载，请检查服务器 FFmpeg/FFprobe 打包依赖。"); }
}

/** Never invoke a shell, log signed URLs/stderr, or allow unbounded subprocess output. */
export async function runMediaCommand(kind: "ffmpeg" | "ffprobe", args: string[], signal: AbortSignal, maxOutputBytes = 1_000_000): Promise<string> {
  signal.throwIfAborted();
  const executable = await mediaBinary(kind);
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, stdio: ["ignore", "pipe", "ignore"] });
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
