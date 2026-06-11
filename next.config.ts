import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['googleapis', 'google-auth-library', 'three'],
  // Use webpack for production builds — Turbopack OOMs on Windows with large 3D deps
  turbopack: undefined,
};

export default nextConfig;
