'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/system'
import {
  browserSaysNo,
  getAdConsent,
  getMetaPixelId,
  pixelAllowedOn,
  pixelPageView,
  setAdConsent,
  subscribeMetaPixel,
} from '@/lib/analytics/meta-pixel'

/**
 * The Meta Pixel's page views, and the cookie question that has to come first.
 *
 * Mounted once in the root layout. Renders nothing at all unless a Pixel is
 * connected in the Founders Hub — so until then there is no prompt, no script
 * and no change to any page.
 *
 * ── Why a prompt, when the rest of the app avoids one ───────────────────────
 * Our own analytics get away without a banner because they set no cookie and
 * load no third party (see `AnalyticsOptOut`). The Pixel does both, and PECR
 * needs a yes before it runs. So the question is asked once, at the TOP of the
 * screen — never the bottom, where every page in this app anchors the button it
 * exists to have pressed — and "No thanks" is exactly as easy as "Accept".
 * The answer can be changed at any time from the privacy notice.
 */
export function MetaPixel() {
  const pathname = usePathname() ?? '/'
  const pixelId = useSyncExternalStore(subscribeMetaPixel, getMetaPixelId, () => null)
  // Read after mount only — localStorage and navigator do not exist on the server.
  const [consent, setConsent] = useState<'granted' | 'denied' | null | 'unknown'>('unknown')
  const [refused, setRefused] = useState(true)

  useEffect(() => {
    setConsent(getAdConsent())
    setRefused(browserSaysNo())
    return subscribeMetaPixel(() => setConsent(getAdConsent()))
  }, [])

  // One PageView per route. The App Router swaps pages without a load, so the
  // Pixel's own automatic PageView would only ever see the first one.
  useEffect(() => {
    if (pixelId && consent === 'granted') pixelPageView()
  }, [pixelId, consent, pathname])

  if (!pixelId || consent !== null || refused || !pixelAllowedOn(pathname)) return null

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookies for advertising"
      style={{
        position: 'fixed',
        top: 'var(--space-3)',
        left: 'var(--space-3)',
        right: 'var(--space-3)',
        marginInline: 'auto',
        maxWidth: '28rem',
        zIndex: 60,
        padding: 'var(--space-4)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--ground-base)',
        border: '1px solid var(--edge)',
        boxShadow: 'var(--shadow-panel)',
        display: 'grid',
        gap: 'var(--space-3)',
      }}
    >
      <p
        style={{
          fontSize: 'var(--text-body-sm)',
          lineHeight: 'var(--leading-snug)',
          color: 'var(--ink-2)',
          margin: 0,
        }}
      >
        Can we use cookies to measure our ads on Facebook and Instagram? Meta would see which pages
        you visit here and whether you buy — never your quiz answers.{' '}
        <Link href="/legal/privacy#advertising" style={{ color: 'var(--ink-1)', textDecoration: 'underline' }}>
          More
        </Link>
      </p>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <Button size="sm" variant="primary" onClick={() => setAdConsent('granted')}>
          Accept
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setAdConsent('denied')}>
          No thanks
        </Button>
      </div>
    </div>
  )
}
