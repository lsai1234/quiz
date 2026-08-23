import type { Instrumentation } from 'next'

/**
 * Server-side error capture, framework-wide.
 *
 * `onRequestError` is called by Next for **every** unhandled error thrown in a
 * Server Component render, a route handler or a server action. That makes it
 * the safety net the explicit `reportError` calls sit inside: a route nobody
 * thought to instrument still lands in the Founders Hub, and it keeps doing so
 * as routes are added, because nothing has to be remembered.
 *
 * The two halves are not redundant:
 *
 *   `onRequestError`  — everything that *throws out* of a request. Broad,
 *                       automatic, zero-maintenance, but it only ever sees
 *                       failures nobody caught.
 *   `reportError(…)`  — the failures that are caught and handled, and so never
 *                       reach here. These are the dangerous ones in commerce: a
 *                       Stripe webhook that catches its own error and answers
 *                       200 has failed silently and successfully. See
 *                       `src/lib/monitoring/report.ts`.
 *
 * ── Why the runtime check and the dynamic import ────────────────────────────
 * This file is bundled for the Node *and* Edge runtimes, and the app has a
 * `src/middleware.ts`, so the edge bundle is really built. The error log writes
 * to Postgres via `pg`, which needs `fs` and `path` — absent on Edge. A plain
 * top-level import therefore fails the build with `Can't resolve 'fs'`.
 *
 * `process.env.NEXT_RUNTIME` is substituted per bundle at build time, so the
 * guard is a constant there and the edge build eliminates the branch, the
 * `require`, and the whole dependency tree behind it.
 *
 * It has to be `require` inside the branch rather than `await import(...)`.
 * Webpack folds a constant condition before resolving a *synchronous* require,
 * but a dynamic `import()` becomes an async chunk that is resolved regardless
 * of the branch being dead — which still drags `pg` into the edge graph and
 * still fails the build. This is the form the Next docs prescribe.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  // Nothing to write to on the Edge runtime, and nothing worth failing over.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@/lib/monitoring/on-request-error') as typeof import('@/lib/monitoring/on-request-error')
    await mod.handleRequestError(err, request, context)
  } catch {
    /* Never let the error reporter throw inside the framework's error path. */
  }
}
