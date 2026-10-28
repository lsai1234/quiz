'use client'

import { useEffect } from 'react'

/**
 * Starts real-user monitoring (plan Phase 7.1) once the page has loaded and
 * gone quiet, so measuring the page never slows it down: web-vitals and the
 * reporter (`lib/analytics/rum.ts`) arrive as their own chunk, after the
 * first scene is usable.
 */
export function RealUserMonitoring() {
  useEffect(() => {
    // The founders' own tools aren't what visitors use.
    if (/^\/(founderhub|styleguide)(\/|$)/.test(window.location.pathname)) return
    let cancelled = false
    let idle: number | undefined
    const start = () => {
      if (cancelled) return
      void import('@/lib/analytics/rum').then((m) => m.startRum())
    }
    const whenIdle = () => {
      const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
      // A beat after load, then idle: past the window anything measures as "first load".
      setTimeout(() => {
        if (w.requestIdleCallback) idle = w.requestIdleCallback(start, { timeout: 5000 })
        else start()
      }, 3000)
    }
    if (document.readyState === 'complete') whenIdle()
    else window.addEventListener('load', whenIdle, { once: true })
    return () => {
      cancelled = true
      window.removeEventListener('load', whenIdle)
      const w = window as Window & { cancelIdleCallback?: (id: number) => void }
      if (idle !== undefined) w.cancelIdleCallback?.(idle)
    }
  }, [])
  return null
}
