import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.AI_BENCHMARK_NEXT_DIST_DIR ?? ".next",
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "51mb",
    },
  },
};

export default nextConfig;
