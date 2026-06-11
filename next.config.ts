import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['three'],
  // Use webpack for production builds — Turbopack OOMs on Windows with large 3D deps
  turbopack: undefined,
};

export default nextConfig;
