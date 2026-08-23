'use client'

import { useEffect } from 'react'
import { installGlobalErrorReporting } from '@/lib/monitoring/client'

/**
 * Mounts the global browser error listeners, once, for the whole app.
 *
 * Rendered from the root layout beside `PortalSync`. It draws nothing — it
 * exists because `window.addEventListener` needs a client component to live in,
 * and putting it at the root means the two failure modes React boundaries cannot
 * see are covered on every page:
 *
 *   - a throw in an event handler, a `setTimeout`, or any non-React code
 *   - a rejected promise nobody awaited — the quiet one, and the way a
 *     checkout usually dies
 */
export function ErrorReporter() {
  useEffect(() => installGlobalErrorReporting(), [])
  return null
}
