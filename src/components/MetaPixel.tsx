'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Icon } from '@/components/ui/Icon'
import {
  browserSaysNo,
  captureClickId,
  getAdConsent,
  getMetaPixelId,
  pixelAllowedOn,
  pixelPageView,
  setAdConsent,
  subscribeMetaPixel,
} from '@/lib/analytics/meta-pixel'

/** Long enough that the landing screen is seen whole before anything appears. */
const ASK_AFTER_MS = 6000

/**
 * The Meta Pixel's page views, and the one-line cookie question it needs.
 *
 * Mounted once in the root layout. Renders nothing unless a Pixel is connected
 * in the Founders Hub.
 *
 * ── Why there is a question at all ──────────────────────────────────────────
 * Our own analytics need no banner: no cookie, no third party (see
 * `AnalyticsOptOut`). The Pixel sets cookies for advertising, and UK law needs a
 * yes before it does — the 2025 relaxation covers analytics, not ads.
 *
 * ── Why it is this small ────────────────────────────────────────────────────
 * It is a single-line pill, not a banner: it waits a few seconds rather than
 * greeting someone on landing, sits at the top — never over the bottom-anchored
 * button every page here exists to have pressed — and does not block, dim or
 * scroll-lock anything. Nothing is lost while it waits: events are held in
 * memory and sent on a yes (`meta-pixel.ts`). Closing it counts as no.
 */
export function MetaPixel() {
  const pathname = usePathname() ?? '/'
  const pixelId = useSyncExternalStore(subscribeMetaPixel, getMetaPixelId, () => null)
  // Read after mount only — localStorage and navigator do not exist on the server.
  const [consent, setConsent] = useState<'granted' | 'denied' | null | 'unknown'>('unknown')
  const [refused, setRefused] = useState(true)
  const [due, setDue] = useState(false)

  useEffect(() => {
    captureClickId()
    setConsent(getAdConsent())
    setRefused(browserSaysNo())
    const timer = setTimeout(() => setDue(true), ASK_AFTER_MS)
    const unsubscribe = subscribeMetaPixel(() => setConsent(getAdConsent()))
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [])

  // One PageView per route — sent now if they have said yes, held if they have
  // not been asked yet. The App Router swaps pages without a load, so the
  // Pixel's own automatic PageView would only ever see the first one.
  //
  // Once per path, not once per render of this effect: tapping OK flushes the
  // held view AND changes `consent`, which re-runs this — and that used to send
  // a second PageView for the same page to Meta every time somebody said yes.
  const viewed = useRef<string | null>(null)
  useEffect(() => {
    if (!pixelId || consent === 'unknown' || viewed.current === pathname) return
    viewed.current = pathname
    pixelPageView()
  }, [pixelId, consent, pathname])

  if (!pixelId || !due || consent !== null || refused || !pixelAllowedOn(pathname)) return null

  return (
    <div
      role="region"
      aria-label="Advertising cookies"
      className="flex items-center"
      style={{
        position: 'fixed',
        top: 'var(--space-2)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 60,
        maxWidth: 'calc(100vw - var(--space-4))',
        gap: 'var(--space-2)',
        padding: 'var(--space-1) var(--space-1) var(--space-1) var(--space-3)',
        borderRadius: 'var(--radius-pill)',
        background: 'var(--ground-base)',
        border: '1px solid var(--edge)',
        fontSize: 'var(--text-meta)',
        lineHeight: 'var(--leading-snug)',
        color: 'var(--ink-3)',
        whiteSpace: 'nowrap',
        animation: 'metaPixelIn var(--duration-slow) var(--ease-spring) both',
      }}
    >
      <style>{'@keyframes metaPixelIn{from{opacity:0;transform:translate(-50%,-8px)}to{opacity:1;transform:translate(-50%,0)}}@media (prefers-reduced-motion: reduce){[aria-label="Advertising cookies"]{animation:none!important}}'}</style>
      <Link href="/legal/privacy#advertising" style={{ color: 'inherit', textDecoration: 'none' }}>
        Cookies for ads?
      </Link>
      <button
        type="button"
        onClick={() => setAdConsent('granted')}
        className="system-focus"
        style={{
          padding: 'var(--space-1) var(--space-3)',
          borderRadius: 'var(--radius-pill)',
          background: 'var(--surface-2)',
          color: 'var(--ink-1)',
          fontWeight: 'var(--weight-strong)',
        }}
      >
        OK
      </button>
      <button
        type="button"
        onClick={() => setAdConsent('denied')}
        aria-label="No thanks"
        className="system-focus flex items-center justify-center"
        style={{ padding: 'var(--space-1)', borderRadius: 'var(--radius-pill)', color: 'var(--ink-3)' }}
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  )
}
