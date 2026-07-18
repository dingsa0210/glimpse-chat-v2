import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack(config) {
    config.resolve.alias["@glimpse/shared"] = path.resolve(__dirname, "../../packages/shared/src/index.ts");
    return config;
  }
};

export default nextConfig;
