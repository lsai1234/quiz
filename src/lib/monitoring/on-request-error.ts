/**
 * The Node-runtime half of `instrumentation.ts`.
 *
 * This lives in its own module for a build reason, not a tidiness one.
 * `instrumentation.ts` is bundled for **both** runtimes, and this file reaches
 * the database — which reaches `pg`, which requires `fs` and `path`. Neither
 * exists on the Edge runtime, so importing it from `instrumentation.ts`
 * directly fails the build outright (`Module not found: Can't resolve 'fs'`)
 * the moment anything edge-side exists, and `src/middleware.ts` does.
 *
 * So the import is behind a `process.env.NEXT_RUNTIME` check that Next replaces
 * with a literal per bundle, letting the edge build drop this branch — and this
 * module with it — entirely. See the runtime section of
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md`.
 */
import { recordError } from './repo'
import { surfaceForPath } from './types'

interface RequestInfo {
  path?: string
  method?: string
}

interface ContextInfo {
  routePath?: string
  routeType?: string
  renderSource?: string
}

export async function handleRequestError(
  err: unknown,
  request: RequestInfo,
  context: ContextInfo,
): Promise<void> {
  const error = err as Error & { digest?: string }
  const path = request?.path ?? context?.routePath ?? null
  const surface = surfaceForPath(path)

  // A failure inside checkout, the Stripe webhook or the nightly job costs money
  // or an order outright — the definition of critical. Everything else is an
  // error: bad, worth fixing, not worth raising the dashboard banner for.
  const critical = surface === 'checkout' || surface === 'webhook' || surface === 'cron'

  await recordError({
    surface,
    severity: critical ? 'critical' : 'error',
    kind: 'server',
    message: error?.message || 'Unhandled server error',
    stack: error?.stack ?? null,
    path,
    context: {
      // Next's own id for this error. It is what the browser is shown in place
      // of a Server Component's real message, and what appears in the platform
      // logs — so it is the thread tying a customer's "reference a1b2c3" to the
      // stack recorded here.
      digest: error?.digest ?? null,
      method: request?.method ?? null,
      routePath: context?.routePath ?? null,
      routeType: context?.routeType ?? null,
      renderSource: context?.renderSource ?? null,
    },
  })
}
