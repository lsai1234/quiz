/**
 * The browser half of the error log.
 *
 * Everything here runs on a page that has just gone wrong, so it is written
 * defensively to a fault: every path is wrapped, nothing throws, nothing
 * retries, and it will drop a report rather than risk a loop. A reporter that
 * can fail loudly is worse than no reporter — it turns one broken component
 * into a broken page.
 *
 * Three sources feed it:
 *   - the route error boundaries (`error.tsx` / `global-error.tsx`)
 *   - `window.onerror` — anything thrown outside React
 *   - `unhandledrejection` — the failed `await` nobody caught, which is the most
 *     common way a checkout dies without a single red line in the console
 */
import { getSessionId, privacyOptedOut } from '@/lib/analytics/events'
import type { ErrorContext, Severity } from './types'

/**
 * Reports allowed per page-load.
 *
 * A render loop can throw thousands of times a second. The cap is what stands
 * between one bad component and a five-figure row count, and it resets on
 * navigation because the counter lives in module scope.
 */
const MAX_PER_PAGE = 10
let sent = 0

/** Fingerprints already reported this page-load, so a repeat costs nothing. */
const seen = new Set<string>()

export interface ClientReport {
  message: string
  stack?: string | null
  severity?: Severity
  context?: ErrorContext
}

/**
 * Send one error report. Safe to call from anywhere, including a render path.
 *
 * Uses `sendBeacon` where available so the report survives the navigation that
 * often follows a crash — a `fetch` from an unloading page is routinely
 * cancelled, which is why "we log client errors" so often means "we log the
 * client errors that didn't matter".
 */
export function reportClientError(report: ClientReport): void {
  if (typeof window === 'undefined') return
  try {
    if (sent >= MAX_PER_PAGE) return

    const message = String(report.message ?? '').slice(0, 500)
    if (!message) return

    // Cheap local de-dupe. Not the server's fingerprint — just enough to stop a
    // component that throws on every render from sending ten identical rows.
    const key = `${message}|${(report.stack ?? '').slice(0, 200)}`
    if (seen.has(key)) return
    seen.add(key)
    sent += 1

    const body = JSON.stringify({
      message,
      stack: report.stack ? String(report.stack).slice(0, 4000) : null,
      // The server re-derives the surface from this; it does not trust a claim.
      path: window.location.pathname,
      // Dropped entirely for a visitor who has opted out of tracking. The report
      // is still sent — a crash is diagnostics, not surveillance, and someone
      // running GPC deserves a working site more than anyone — but it arrives
      // with nothing that could group their visit.
      session: privacyOptedOut() ? null : getSessionId(),
      severity: report.severity ?? 'error',
      context: report.context ?? {},
    })

    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/api/errors', new Blob([body], { type: 'application/json' }))
    } else {
      void fetch('/api/errors', {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }).catch(() => {})
    }
  } catch {
    /* the reporter must never be the thing that breaks the page */
  }
}

/**
 * Attach the global listeners. Returns a detach function.
 *
 * Called once from `<ErrorReporter />` in the root layout.
 */
export function installGlobalErrorReporting(): () => void {
  if (typeof window === 'undefined') return () => {}

  const onError = (event: ErrorEvent) => {
    // A cross-origin script error arrives with no message, no file and no
    // stack — the browser's "Script error." Reporting it tells you only that
    // something, somewhere, failed, which is noise rather than signal.
    if (!event.message || event.message === 'Script error.') return
    reportClientError({
      message: event.message,
      stack: event.error instanceof Error ? event.error.stack : null,
      context: {
        source: event.filename ?? null,
        line: event.lineno ?? null,
        column: event.colno ?? null,
        via: 'window.onerror',
      },
    })
  }

  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason
    reportClientError({
      message:
        reason instanceof Error
          ? reason.message
          : typeof reason === 'string'
            ? reason
            : 'Unhandled promise rejection',
      stack: reason instanceof Error ? reason.stack : null,
      context: { via: 'unhandledrejection' },
    })
  }

  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)

  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
  }
}
