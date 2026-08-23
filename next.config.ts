import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['three', 'better-sqlite3', 'pg'],
  turbopack: undefined,
  /**
   * Keep the database drivers out of the Edge bundle.
   *
   * `src/instrumentation.ts` is compiled for *both* server runtimes, and this
   * app has an edge-runtime proxy (`src/middleware.ts`), so the edge
   * compilation really is produced. `onRequestError` records to the database,
   * which reaches `pg` and `better-sqlite3` — both of which require `fs` and
   * `path`, neither of which exists on Edge. Without this the build fails
   * outright with `Module not found: Can't resolve 'fs'`.
   *
   * Two things that do *not* fix it, for whoever tries them next:
   *   - `serverExternalPackages` above: that governs the Node server bundle only.
   *   - A `process.env.NEXT_RUNTIME` guard around the import: webpack resolves
   *     the module graph before it folds the branch, so the dependency is
   *     traced whether or not the code can ever run. Aliasing the `@/…`
   *     specifier does not work either — Next resolves those through a resolve
   *     plugin rather than through `resolve.alias`, so the entry never matches.
   *
   * Aliasing the two driver packages themselves does work, because a bare
   * package name goes through `resolve.alias` normally. It is also honest:
   * middleware states in its own header that it runs "on the edge with no
   * database", and `engine.ts` only ever loads a driver from inside an async
   * function, so nothing on Edge can reach one at runtime either.
   */
  webpack: (config, { nextRuntime }) => {
    if (nextRuntime === 'edge') {
      config.resolve.alias = {
        ...config.resolve.alias,
        'better-sqlite3': false,
        pg: false,
        // The engines' own Node builtins, reached transitively. Edge has no
        // filesystem, so these are absent there in fact as well as in the
        // bundle — this makes the graph agree with the runtime instead of
        // failing on a dependency that could never have loaded.
        fs: false,
        path: false,
      }
    }
    return config
  },
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
