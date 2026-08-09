import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['three', 'better-sqlite3', 'pg'],
  turbopack: undefined,
  // Skip type-checking in the build worker to avoid OOM on constrained machines.
  // Run `npx tsc --noEmit` separately for type safety.
  typescript: { ignoreBuildErrors: true },
  async headers() {
    return [
      {
        // The confirmation document itself, not just the API behind it
        // (OC-NFR-016). Without this a browser can serve it from bfcache on
        // back-navigation from an abandoned Stripe checkout — showing a
        // confirmation to someone who never paid (OC-F-009) — and a CDN could
        // hand one customer's page to the next.
        source: '/order/confirmation',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, max-age=0' },
          { key: 'Pragma', value: 'no-cache' },
          // Belt and braces with the route's own robots metadata.
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // Bundles live at /bundles/[slug]. The first bundle shipped at a fixed
      // path and is promoted verbally as "the Big Night Big Morning bundle" —
      // catch the old path and the natural longhand URL.
      { source: '/big-night-big-morning', destination: '/bundles/big-night-big-morning', permanent: false },
      { source: '/big-night-big-morning-bundle', destination: '/bundles/big-night-big-morning', permanent: false },

      // The customer hub moved /hub → /myhub and the founders' hub /portal →
      // /founderhub when the site moved to the apex domain. Emails already in
      // people's inboxes deep-link into /hub?change=… — query strings are
      // carried over by Next automatically, so those keep working. Temporary
      // (307) rather than permanent: these paths stay ours to reuse, and a 308
      // is cached by the browser until it is cleared. The *host* redirect off
      // quiz.getchrgd.co.uk is the opposite case and should be a 301 — see
      // docs/DOMAIN_SETUP.md.
      { source: '/hub', destination: '/myhub', permanent: false },
      { source: '/hub/:path*', destination: '/myhub/:path*', permanent: false },
      { source: '/portal', destination: '/founderhub', permanent: false },
      { source: '/portal/:path*', destination: '/founderhub/:path*', permanent: false },
    ];
  },
};

export default nextConfig;
