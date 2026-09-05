'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  readStackHandoff,
  clearStackHandoff,
  whatIsLost,
  STACK_RETURN_HREF,
  type StackHandoff,
} from '@/lib/shop/stack-handoff'
import { track } from '@/lib/analytics/events'

/**
 * The way back to a stack somebody stepped out of.
 *
 * ── Why it is here at all ───────────────────────────────────────────────────
 * The reveal offers a quiet door into the shop for people who want two of the
 * five products rather than all of them. Taking it costs them their code's
 * discount, which is said before they go — but a decision made on a price is
 * one people reverse, and someone who looks at the shelf and changes their mind
 * must not have to redo the quiz to get their discount back.
 *
 * ── Why it is a bar and not a toast ─────────────────────────────────────────
 * A toast is gone in four seconds and this has to survive them browsing. It
 * sits under the header, above everything, for as long as the tab is open.
 *
 * ── Why it says the number ──────────────────────────────────────────────────
 * "Back to your stack" is a navigation label. "Back to your stack · 25% off
 * there" is the reason to press it, and it is the same number they were shown
 * on the way out — so the two screens agree rather than one of them selling
 * and the other hedging.
 */
export function StackReturnBar() {
  const [handoff, setHandoff] = useState<StackHandoff | null>(null)

  useEffect(() => {
    setHandoff(readStackHandoff())
  }, [])

  if (!handoff) return null

  const lost = whatIsLost(handoff.discountPct)

  return (
    <div style={{ padding: '0 var(--space-4)', marginTop: 'var(--space-3)' }}>
      <div
        className="flex items-center justify-between"
        style={{
          gap: 'var(--space-3)',
          padding: 'var(--space-3) var(--space-4)',
          borderRadius: 'var(--r-card)',
          background: 'var(--surface)',
          /* The one accent edge on the page that is not the primary action.
             It is a held position, not an offer, and it should read as one. */
          border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p className="sf-body" style={{ color: 'var(--text)' }}>
            Your stack is saved
          </p>
          <p className="sf-meta">
            {handoff.items} product{handoff.items === 1 ? '' : 's'}
            {lost ? ` · ${lost} there` : ''} · full price here
          </p>
        </div>

        <Link
          href={STACK_RETURN_HREF}
          data-interactive
          onClick={() => {
            track('stack_return', { items: handoff.items })
            // Going back IS the end of the handoff. Leaving the flag set would
            // put the bar back on the shop next time they wander over, offering
            // to return them to a stack they are already looking at.
            clearStackHandoff()
          }}
          className="sf-button inline-flex items-center justify-center flex-shrink-0"
          style={{
            minHeight: 36,
            padding: '0 var(--space-4)',
            borderRadius: 'var(--r-control)',
            background: 'var(--accent)',
            color: 'var(--accent-ink)',
            fontSize: 'var(--meta-size)',
            fontWeight: 'var(--weight-medium)',
          }}
        >
          Back to it
        </Link>
      </div>
    </div>
  )
}
