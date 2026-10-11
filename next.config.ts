import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

const nextConfig: NextConfig = {
  distDir: process.env.AI_BENCHMARK_NEXT_DIST_DIR ?? ".next",
  reactStrictMode: true,
  experimental: {
    // Keep recently visited dynamic workflow pages in the browser router cache.
    // Server Actions already invalidate affected routes after every write.
    staleTimes: { dynamic: 120 },
  },
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas", "ffmpeg-static", "@ffprobe-installer/ffprobe"],
  outputFileTracingIncludes: {
    "/*": ["./node_modules/ffmpeg-static/ffmpeg", "./node_modules/@ffprobe-installer/linux-x64/ffprobe", "./node_modules/@ffprobe-installer/darwin-arm64/ffprobe", "./node_modules/@ffprobe-installer/darwin-x64/ffprobe"],
    "/api/cron/quick-workflow": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs", "./node_modules/pdfjs-dist/cmaps/**/*", "./node_modules/pdfjs-dist/standard_fonts/**/*", "./node_modules/pdfjs-dist/wasm/**/*"],
    "/projects/*": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs", "./node_modules/pdfjs-dist/cmaps/**/*", "./node_modules/pdfjs-dist/standard_fonts/**/*", "./node_modules/pdfjs-dist/wasm/**/*"],
  },
  // Next dev also serves the machine's LAN URL. Allow only this host's addresses,
  // not a wildcard subnet; production origin checks are unaffected.
  allowedDevOrigins: [...new Set([
    "127.0.0.1",
    ...Object.values(networkInterfaces()).flatMap(addresses =>
      (addresses ?? []).filter(address => address.family === "IPv4" && !address.internal).map(address => address.address),
    ),
  ])],
};

export default nextConfig;
