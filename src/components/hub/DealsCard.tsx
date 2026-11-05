'use client'

import { useEffect, useState } from 'react'
import { Badge, Button, Card, Note } from '@/components/system'
import { useOfferCheckout } from '@/hooks/useOfferCheckout'
import { DEALS_COPY as C } from '@/lib/deals/copy'
import type { MemberDeal } from '@/lib/deals/engine'
import type { DealsState } from '@/lib/deals/server'
import type { PublicOfferQuote } from '@/lib/last-chance/economics'

/**
 * Member prices in the hub: a price on each product they've bought, open as
 * it's due to run out. Open ones first, with a button that buys it on its
 * own through the checkout's one-product path (which prices it again and
 * never charges more than shown); what's coming up after. Nothing shows
 * while deals are switched off or there are none.
 */

const day = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })
const eyebrow = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--text-micro)',
  fontWeight: 'var(--weight-strong)',
  letterSpacing: 'var(--tracking-eyebrow)',
  textTransform: 'uppercase' as const,
  color: 'var(--accent)',
}
const meta = { color: 'var(--ink-3)', fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)' }
const strong = { color: 'var(--ink-1)', fontSize: 'var(--text-body)', fontWeight: 'var(--weight-strong)', lineHeight: 'var(--leading-snug)' }

export function DealsCard() {
  const [state, setState] = useState<DealsState | null>(null)

  useEffect(() => {
    let live = true
    if (typeof fetch !== 'function') return
    fetch('/api/hub/deals')
      .then((r) => (r.ok ? r.json() : null))
      .then((s: DealsState | null) => live && setState(s))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  if (!state?.enabled || !state.deals?.length) return null
  const open = state.deals.filter((d) => d.state === 'open')
  const upcoming = state.deals.filter((d) => d.state === 'upcoming')

  return (
    <div data-deals>
      <Card padding="roomy">
        <p style={eyebrow}>{C.eyebrow}</p>
        <h2 style={{ ...strong, fontSize: 'var(--text-title)', fontFamily: 'var(--font-display)', marginTop: 'var(--space-2)' }}>{C.heading}</h2>
        <p style={{ color: 'var(--ink-2)', fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-body)', marginTop: 'var(--space-2)' }}>{C.intro}</p>

        {open.length > 0 && (
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-5)' }}>
            {open.map((d) => (
              <OpenDeal key={d.productId} deal={d} />
            ))}
          </ul>
        )}

        {upcoming.length > 0 && (
          <div style={{ marginTop: 'var(--space-5)' }}>
            <h3 style={{ ...eyebrow, color: 'var(--ink-2)' }}>{C.upcomingHeading}</h3>
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
              {upcoming.map((d) => (
                <li key={d.productId} data-deal={d.productId} data-deal-state="upcoming">
                  <p style={{ ...strong, fontSize: 'var(--text-body-sm)' }}>
                    {d.short}: {C.dealLine(d.quote)}
                  </p>
                  <p style={{ color: 'var(--ink-2)', fontSize: 'var(--text-body-sm)' }}>{C.price(d.quote.total, d.quote.normalTotal)}</p>
                  <p style={meta}>
                    {C.opensIn(d.opensInDays, day(d.opensOn))} · {d.estimated ? C.runsOutEstimated(day(d.runsOutOn)) : C.runsOut(day(d.runsOutOn))}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', marginTop: 'var(--space-5)' }}>
          {state.deals.some((d) => d.quote.deliveryDeal === 'free') && <p style={meta}>{C.freeDeliveryCondition}</p>}
          <p style={meta}>{C.terms}</p>
          {state.hubEndsOn && <p style={meta}>{C.hubOpen(day(state.hubEndsOn))}</p>}
        </div>
      </Card>
    </div>
  )
}

function OpenDeal({ deal }: { deal: MemberDeal }) {
  const { state, buy } = useOfferCheckout()
  const [quote, setQuote] = useState<PublicOfferQuote>(deal.quote)
  const changed = state.status === 'changed' ? state : null
  useEffect(() => {
    if (changed?.quote) setQuote(changed.quote)
  }, [changed?.quote])
  const busy = state.status === 'loading' || state.status === 'redirecting'

  return (
    <li data-deal={deal.productId} data-deal-state="open">
      <div className="flex items-start" style={{ gap: 'var(--space-3)' }}>
        {deal.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={deal.imageUrl} alt="" width={56} height={56} style={{ width: 'calc(var(--space-8) * 1.75)', height: 'calc(var(--space-8) * 1.75)', objectFit: 'contain', borderRadius: 'var(--radius-chip)', background: 'var(--surface-2)' }} />
        )}
        <div className="min-w-0" style={{ flex: 1 }}>
          <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)' }}>
            <p style={strong}>{deal.short}</p>
            <Badge tone="positive">{C.dealLine(quote)}</Badge>
          </div>
          <p style={{ color: 'var(--ink-2)', fontSize: 'var(--text-body-sm)', marginTop: 'var(--space-1)' }}>{C.price(quote.total, quote.normalTotal)}</p>
          <p style={meta}>{C.openUntil(day(deal.endsOn))}</p>
        </div>
      </div>
      {changed && (
        <div style={{ marginTop: 'var(--space-2)' }}>
          <Note tone="attention" live="polite">
            {C.changed}
          </Note>
        </div>
      )}
      {state.status === 'error' && (
        <div style={{ marginTop: 'var(--space-2)' }}>
          <Note tone="critical" live="assertive">
            {state.message || C.error}
          </Note>
        </div>
      )}
      <div style={{ marginTop: 'var(--space-3)' }}>
        <Button
          variant="primary"
          fullWidth
          loading={busy}
          onClick={() => void buy({ variantId: deal.variantId, productTitle: deal.title, quote, from: 'hub_deal' })}
          data-deal-buy
        >
          {busy ? C.buying : C.buy(quote.total)}
        </Button>
      </div>
    </li>
  )
}
