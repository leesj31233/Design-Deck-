import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Do not generate AGENTS.md / CLAUDE.md on `next dev`.
  agentRules: false,
};

export default nextConfig;
