'use client'

import { useId } from 'react'
import { Badge, Button } from '@/components/system'
import { Icon } from '@/components/ui/Icon'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { packLengthLabel } from '@/lib/product-facts'
import { OFFER_COPY } from '@/lib/offer/copy'
import { ProductTile } from './ProductTile'

/**
 * "Start here": the core offer, the first thing under their results (plan
 * Phase 4). One product, the hero ("Not the obvious pick") or with the hero
 * switch off their top pick ("Your top pick"): why it is theirs, what it does
 * in the register's own words or nothing, what you get, and the delivered
 * price, one tap from paying for it.
 *
 * Calm on purpose. It used to be the last-chance card at the foot of the page,
 * a reveal for somebody leaving; at the top it is a starting point, so it
 * arrives already still, and says nothing about time or scarcity.
 *
 * Purely presentational: the page chooses, prices and buys.
 */
export interface CoreOfferCardProps {
  label: string
  title: string
  /** What kind of thing it is ("Magnesium"). */
  role: string
  imageUrl: string | null
  formats: readonly string[]
  reason: string | null
  /** One register claim, verbatim, or null. */
  claim: string | null
  servings: number | null
  perServing: number | null
  packMonths: number | null
  /** On its deal: the delivered price it comes down from, and what changed. */
  deal: { normalTotal: number; deliveryDeal: 'free' | 'reduced' | 'included' | 'standard'; discountPct: number } | null
  /** Delivered (£): what the button charges. */
  total: number
  remoteSurcharge: number
  /** The sticky bar is following this option. */
  selected: boolean
  status: 'idle' | 'loading' | 'redirecting' | 'error' | 'changed'
  message?: string | null
  blocked?: boolean
  /** A code is applied: say it works on the stack, not here. */
  codeNote?: string | null
  onBuy: () => void
  onCtaRef?: (el: HTMLButtonElement | null) => void
}

const INK = 'var(--color-text)'
const INK_2 = 'var(--color-text-2)'
const DISPLAY = 'var(--font-display)'

function dealLine(deal: NonNullable<CoreOfferCardProps['deal']>): string | null {
  const parts: string[] = []
  if (deal.deliveryDeal === 'free') parts.push('Free UK mainland delivery')
  if (deal.deliveryDeal === 'reduced') parts.push('Reduced delivery')
  if (deal.deliveryDeal === 'included') parts.push('Free UK mainland delivery at this price')
  if (deal.discountPct > 0) parts.push(`${deal.discountPct}% off`)
  return parts.length ? parts.join(' · ') : null
}

export function CoreOfferCard(p: CoreOfferCardProps) {
  const titleId = useId()
  const busy = p.status === 'loading' || p.status === 'redirecting'
  const saving = p.deal ? Math.round((p.deal.normalTotal - p.total) * 100) / 100 : 0
  const facts = [
    p.servings ? `${p.servings} servings` : null,
    p.perServing != null ? `${formatGBP(p.perServing)} a serving` : null,
    p.packMonths != null ? `lasts ${packLengthLabel(p.packMonths)} at your usage` : null,
  ].filter(Boolean)

  return (
    <section aria-labelledby={titleId} className="px-5 pt-10 max-w-lg mx-auto" data-core-offer>
      <p className="text-[10px] font-bold tracking-[0.25em] uppercase" style={{ fontFamily: DISPLAY, color: 'var(--color-accent)' }}>
        {OFFER_COPY.startHere}
      </p>

      <div
        className="mt-3 rounded-2xl p-4"
        style={{
          background: 'var(--color-surface-2)',
          border: `1px solid ${p.selected ? 'color-mix(in srgb, var(--color-accent) 55%, var(--color-border))' : 'var(--color-border)'}`,
          boxShadow: p.selected ? '0 0 0 1px color-mix(in srgb, var(--color-accent) 35%, transparent)' : 'none',
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <Badge tone="accent">{p.label}</Badge>
          <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: INK_2 }}>{p.role}</span>
        </div>

        <div className="mt-3 flex items-start gap-3.5">
          <ProductTile imageUrl={p.imageUrl} formats={p.formats} title={p.title} size={72} style={{ borderRadius: 16 }} />
          <div className="min-w-0">
            <h2 id={titleId} style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.01em', color: INK }}>
              {p.title}
            </h2>
            {p.reason && (
              <p className="mt-1.5 text-[13px] leading-snug" style={{ color: INK_2 }}>
                {p.reason}
              </p>
            )}
          </div>
        </div>

        {(p.claim || facts.length > 0) && (
          <dl className="mt-4 grid gap-2.5">
            {p.claim && (
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wide" style={{ color: INK_2 }}>{OFFER_COPY.whatItDoes}</dt>
                <dd className="mt-0.5 text-[13px] leading-snug" style={{ color: INK }}>{p.claim}.</dd>
              </div>
            )}
            {facts.length > 0 && (
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wide" style={{ color: INK_2 }}>{OFFER_COPY.whatYouGet}</dt>
                <dd className="mt-0.5 text-[13px] leading-snug" style={{ color: INK }}>{facts.join(' · ')}.</dd>
              </div>
            )}
          </dl>
        )}

        <div className="mt-4 pt-3.5 flex items-end justify-between gap-3" style={{ borderTop: '1px solid var(--color-border)' }}>
          <div className="min-w-0">
            <span className="block tabular-nums" style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 800, lineHeight: 1, color: INK }}>
              {formatGBP(p.total)}
            </span>
            <span className="mt-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: INK_2 }}>
              {OFFER_COPY.delivered}
            </span>
          </div>
          {p.deal && saving > 0 && (
            <span className="flex shrink-0 flex-col items-end gap-1 text-right">
              <span className="text-[12px] tabular-nums line-through" style={{ color: INK_2 }}>{formatGBP(p.deal.normalTotal)}</span>
              <span className="text-[11px] font-semibold" style={{ color: 'var(--tone-positive)' }}>{dealLine(p.deal)}</span>
            </span>
          )}
        </div>

        <Button
          ref={p.onCtaRef}
          className="mt-4"
          variant="primary"
          size="lg"
          fullWidth
          loading={busy}
          disabled={p.blocked}
          iconRight={busy ? undefined : 'arrow-right'}
          onClick={p.onBuy}
        >
          {p.status === 'redirecting' ? 'Taking you to checkout…' : busy ? 'One moment…' : OFFER_COPY.startWithThis}
        </Button>

        {(p.status === 'error' || p.status === 'changed') && p.message && (
          <p role="alert" className="mt-2.5 flex items-start gap-1.5 text-xs" style={{ color: p.status === 'error' ? 'var(--color-red)' : INK }}>
            <span className="mt-px shrink-0"><Icon name="alert-triangle" size={13} /></span>
            {p.message}
          </p>
        )}

        <p className="mt-3 text-center text-[11px] leading-snug" style={{ color: INK_2 }}>
          {OFFER_COPY.justThis}
          {p.codeNote && (
            <>
              <br />
              {p.codeNote}
            </>
          )}
          {p.remoteSurcharge > 0 && (
            <>
              <br />
              {OFFER_COPY.remote(p.remoteSurcharge)}
            </>
          )}
        </p>
      </div>
    </section>
  )
}
