import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['three', 'better-sqlite3', 'pg'],
  turbopack: undefined,
  // Skip type-checking in the build worker to avoid OOM on constrained machines.
  // Run `npx tsc --noEmit` separately for type safety.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
