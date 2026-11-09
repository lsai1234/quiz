'use client'

import Link from 'next/link'
import { Card, buttonSurface } from '@/components/system'
import { useOfferSettings } from '@/hooks/useOfferSettings'
import { HUB_PLAN_COPY as C } from '@/lib/hub-plan/copy'
import { hubOnSale } from '@/lib/offer/settings'

/**
 * The member hub on its own, on the shop's front: £X a month, and beside it
 * that any stack brings it free for 90 days. Only while it's on sale (Founders
 * Hub → Member hub → "Sell the hub on its own", with the training plan or the
 * trainer on, so there's something in it).
 */
export function ShopHubCard() {
  const { settings } = useOfferSettings()
  if (!hubOnSale(settings)) return null
  const cta = buttonSurface('primary', 'md')
  return (
    <div style={{ padding: '0 var(--space-4)', marginTop: 'var(--space-5)' }} data-shop-hub>
      <Card padding="roomy" elevation={2} tone="accent">
        <p style={{ color: 'var(--accent)', fontSize: 'var(--text-meta)', fontWeight: 'var(--weight-strong)', letterSpacing: 'var(--tracking-eyebrow)', textTransform: 'uppercase' }}>
          {C.shopEyebrow}
        </p>
        <p
          style={{
            color: 'var(--ink-1)',
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-title)',
            fontWeight: 'var(--weight-strong)',
            letterSpacing: 'var(--tracking-title)',
            lineHeight: 'var(--leading-tight)',
            marginTop: 'var(--space-2)',
          }}
        >
          {C.shopTitle}
        </p>
        <p style={{ color: 'var(--ink-2)', fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-body)', marginTop: 'var(--space-2)' }}>{C.shopLine}</p>
        <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
          <Link href="/shop/hub" className={cta.className} style={cta.style}>
            {C.shopCta}
          </Link>
          <span style={{ color: 'var(--ink-1)', fontSize: 'var(--text-body)', fontWeight: 'var(--weight-strong)' }}>{C.shopPrice(settings.hubPrice.monthly)}</span>
        </div>
        <p style={{ color: 'var(--ink-3)', fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', marginTop: 'var(--space-3)' }}>{C.shopFree}</p>
      </Card>
    </div>
  )
}
