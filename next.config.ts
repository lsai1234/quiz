import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['three', 'better-sqlite3', 'pg'],
  turbopack: undefined,
  // Skip type-checking in the build worker to avoid OOM on constrained machines.
  // Run `npx tsc --noEmit` separately for type safety.
  typescript: { ignoreBuildErrors: true },
  async redirects() {
    return [
      // Bundles live at /bundles/[slug]. The first bundle shipped at a fixed
      // path and is promoted verbally as "the Big Night Big Morning bundle" —
      // catch the old path and the natural longhand URL.
      { source: '/big-night-big-morning', destination: '/bundles/big-night-big-morning', permanent: false },
      { source: '/big-night-big-morning-bundle', destination: '/bundles/big-night-big-morning', permanent: false },
    ];
  },
};

export default nextConfig;
