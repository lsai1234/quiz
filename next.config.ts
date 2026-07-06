import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['three'],
  turbopack: undefined,
  // Skip type-checking in the build worker to avoid OOM on constrained machines.
  // Run `npx tsc --noEmit` separately for type safety.
  typescript: { ignoreBuildErrors: true },
  async redirects() {
    return [
      // The bundle is promoted verbally as "the Big Night Big Morning bundle" —
      // catch the natural longhand URL too.
      {
        source: '/big-night-big-morning-bundle',
        destination: '/big-night-big-morning',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
