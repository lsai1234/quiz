/**
 * Real-user monitoring (Amp Consult and offer plan, Phase 7.1): the visitor's
 * own browser measures the page, and the numbers go out as two anonymous
 * analytics events (`vitals.ts` says what they hold and how the hub reads
 * them).
 *
 * Loaded late, by `RealUserMonitoring`, once the page has finished loading
 * and gone idle: never on the first scene's path. web-vitals and the long
 * animation frame observer both read buffered entries, so starting late still
 * sees the page from its first paint.
 */
import { onCLS, onINP, onLCP, type Metric } from 'web-vitals'
import { track } from './events'

let started = false

interface LongFrame extends PerformanceEntry {
  blockingDuration?: number
}

export function startRum(): void {
  if (started || typeof window === 'undefined') return
  started = true

  const send = (m: Metric) =>
    track('web_vital', {
      metric: m.name,
      // CLS is a unitless score; the others are milliseconds.
      value: m.name === 'CLS' ? Math.round(m.value * 1000) / 1000 : Math.round(m.value),
      rating: m.rating,
    })
  onLCP(send)
  onINP(send)
  onCLS(send)

  // Long animation frames, where the browser reports them: one summary per
  // page, sent when it's hidden (the last moment a page is sure to see).
  if (typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame')) return
  let count = 0
  let worst = 0
  let blocking = 0
  new PerformanceObserver((list) => {
    for (const e of list.getEntries() as LongFrame[]) {
      count++
      worst = Math.max(worst, e.duration)
      blocking += e.blockingDuration ?? 0
    }
  }).observe({ type: 'long-animation-frame', buffered: true })
  let sent = false
  const flush = () => {
    if (sent || document.visibilityState !== 'hidden') return
    sent = true
    track('long_frames', { count, worstMs: Math.round(worst), blockingMs: Math.round(blocking) })
  }
  document.addEventListener('visibilitychange', flush)
}
