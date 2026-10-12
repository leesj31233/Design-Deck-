import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
  // PGlite ships WASM and postgres-js uses Node sockets: load them at runtime instead of bundling.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  outputFileTracingIncludes: {
    "/api/engflow/**": ["./db/migrations/**"],
  },
};

export default nextConfig;
