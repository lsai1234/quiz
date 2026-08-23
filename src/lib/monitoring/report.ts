/**
 * `reportError` — the one call a server code path makes when something breaks.
 *
 * The codebase already had seventy-odd `console.error` sites. On Vercel those go
 * to a log stream nobody is watching, which means that in practice a failure in
 * the checkout at 9pm on a Saturday was observed by nobody until a customer
 * emailed. This does not replace those lines — a log is still the right place
 * for the full object — it puts the same fault somewhere a founder actually
 * looks.
 *
 * The contract is deliberately blunt: **it never throws and it never rejects in
 * a way a caller has to handle.** Call sites are already on their error path;
 * asking them to error-handle their error handler is how monitoring ends up
 * commented out.
 */
import { recordError } from './repo'
import type { ErrorContext, ErrorKind, Severity, Surface } from './types'

export interface ReportOptions {
  surface: Surface
  /** Defaults to `error`. Reserve `critical` for money and orders. */
  severity?: Severity
  /** Defaults to `server`. */
  kind?: ErrorKind
  /** The route or job that was running. */
  path?: string | null
  sessionId?: string | null
  userId?: string | null
  /** Structured detail: ids, modes, counts. Never PII. */
  context?: ErrorContext
}

function describe(err: unknown): { message: string; stack: string | null } {
  if (err instanceof Error) {
    return { message: err.message || err.name, stack: err.stack ?? null }
  }
  if (typeof err === 'string') return { message: err, stack: null }
  try {
    return { message: JSON.stringify(err), stack: null }
  } catch {
    return { message: String(err), stack: null }
  }
}

/**
 * Record a server-side failure. Fire-and-forget by design.
 *
 * Returns the fingerprint so a caller that wants to quote it back ("error
 * reference a1b2c3") can, but awaiting it is optional and ignoring it is fine.
 */
export async function reportError(err: unknown, options: ReportOptions): Promise<string | null> {
  try {
    const { message, stack } = describe(err)
    return await recordError({
      surface: options.surface,
      severity: options.severity ?? 'error',
      kind: options.kind ?? 'server',
      message,
      stack,
      path: options.path ?? null,
      sessionId: options.sessionId ?? null,
      userId: options.userId ?? null,
      context: options.context,
    })
  } catch {
    return null
  }
}

/**
 * The same thing, for callers that must not await — a webhook handler that has
 * to answer Stripe inside its timeout, say. Schedules the write and returns.
 */
export function reportErrorAsync(err: unknown, options: ReportOptions): void {
  void reportError(err, options)
}
