'use client'

import { useEffect, useState } from 'react'
import { privacyOptedOut, setAnalyticsOptOut } from '@/lib/analytics/events'

const ACCENT = '#00D4FF'
const SEEN_KEY = 'chrgd_storage_notice_seen'

/**
 * The storage notice.
 *
 * PECR regulation 6 covers anything stored on a visitor's device, not just
 * cookies, and the funnel's per-visit id is storage. It is about as far from
 * tracking as storage gets — no cookie, no third-party script, no cross-session
 * identifier, nothing personal in the payload, and it is dropped when the tab
 * closes — but "not tracking" is not the same as "no consent needed", and
 * saying so plainly costs very little.
 *
 * ── Why this is a line of text and not a modal ──────────────────────────────
 * Proportionality. A blocking two-button consent wall in front of a quiz is the
 * pattern the ICO has been most critical of, and it would be a wildly
 * disproportionate greeting for one anonymous session id. What is here instead:
 * a quiet, dismissible strip that says exactly what is stored and offers a real
 * off switch — one that stops collection immediately and is remembered.
 *
 * It renders for nobody whose browser already says no. Asking someone who has
 * set Do Not Track or Global Privacy Control to make the same decision again is
 * ignoring the answer they already gave.
 */
export function StorageNotice() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      // A browser signal, or an answer already given, both mean say nothing.
      if (privacyOptedOut()) return
      if (window.localStorage.getItem(SEEN_KEY) === '1') return
      setVisible(true)
    } catch {
      /* storage unavailable — nothing is being stored either, so say nothing */
    }
  }, [])

  if (!visible) return null

  function close() {
    try {
      window.localStorage.setItem(SEEN_KEY, '1')
    } catch {
      /* the notice reappears next visit, which is the harmless direction */
    }
    setVisible(false)
  }

  function optOut() {
    setAnalyticsOptOut(true)
    close()
  }

  return (
    <div
      role="region"
      aria-label="How this site uses storage"
      className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 pointer-events-none"
    >
      <div
        className="mx-auto max-w-[560px] rounded-2xl p-4 pointer-events-auto shadow-lg"
        style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
      >
        <p className="text-[12px] leading-relaxed text-[var(--color-text-2)]">
          We keep one random number in your browser so we can see where people get stuck. It has
          nothing personal in it, it is not shared with anyone, and it goes when you close the tab.{' '}
          <a
            href="/legal/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            style={{ color: ACCENT }}
          >
            Privacy notice
          </a>
        </p>
        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={close}
            className="rounded-xl px-4 py-2 text-[12px] font-semibold"
            style={{ background: ACCENT, color: '#04121a' }}
          >
            That’s fine
          </button>
          <button
            type="button"
            onClick={optOut}
            className="rounded-xl px-4 py-2 text-[12px] font-semibold text-[var(--color-text-2)]"
            style={{ border: '1px solid var(--color-border)' }}
          >
            No thanks
          </button>
        </div>
      </div>
    </div>
  )
}
