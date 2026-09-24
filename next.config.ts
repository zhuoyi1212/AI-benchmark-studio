import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

const nextConfig: NextConfig = {
  distDir: process.env.AI_BENCHMARK_NEXT_DIST_DIR ?? ".next",
  reactStrictMode: true,
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
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
  experimental: {
    serverActions: {
      bodySizeLimit: "51mb",
    },
  },
};

export default nextConfig;
