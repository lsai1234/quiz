'use client'

import Link from 'next/link'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { FREE_GIFT_TERMS_PATH, OFFER_COPY } from '@/lib/offer/copy'
import { PLAN_COPY } from '@/lib/offer/plan-copy'
import { ProductTile } from './ProductTile'
import { YOU_PALETTE as P } from './you-palette'

/**
 * The offer at a glance (the clarity pass): the first thing under "Here's
 * your stack", so someone new sees what's on offer before any of the reasons.
 *
 *   Start here             one product, delivered, one tap to buy
 *   Or get the full stack  how many products, the price, and the free gift
 *                          with its conditions beside it
 *
 * Everything here is said again, in full, further down (the Start here card,
 * the depth picker, the receipt); this only puts the two choices side by side.
 * "Free" is never said without its conditions next to it (CAP Code 3.23–3.25),
 * and the wording is all `OFFER_COPY`, in the review pack.
 */

export interface OfferSummaryProps {
  core: {
    /** "Not the obvious pick" or "Your top pick". */
    label: string
    product: Pick<CatalogueProduct, 'title' | 'imageUrl' | 'formats'>
    total: number
    busy: boolean
    onStart: () => void
  } | null
  stack: {
    count: number
    /** Null when this depth can't be a subscription. */
    monthly: number | null
    /** Its subscribe-and-save rate, as a whole percent. */
    monthlyPct: number
    oneOff: number
    onSee: () => void
  }
  /** The free gift on this depth, or what would qualify; with its conditions. */
  gift: { headline: string; moreFor?: string | null; conditions: string } | null
}

const DISPLAY = 'var(--font-display)'

export function OfferSummary({ core, stack, gift }: OfferSummaryProps) {
  return (
    <section aria-labelledby="offer-summary-heading" data-offer-summary className="relative mt-6 rounded-2xl" style={{ background: P.page, border: `1px solid ${P.hairline}` }}>
      <h3 id="offer-summary-heading" className="px-4 pt-4 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: P.ink3, fontFamily: DISPLAY }}>
        {OFFER_COPY.summaryHeading}
      </h3>

      {core && (
        <div className="px-4 pb-4 pt-3" data-offer-option="core">
          <p className="text-[12px] font-bold" style={{ color: P.accentInk, fontFamily: DISPLAY }}>
            {OFFER_COPY.startHere} · {core.label}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <ProductTile imageUrl={core.product.imageUrl} formats={core.product.formats} title={core.product.title} size={44} />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold leading-snug" style={{ color: P.ink }}>
                {core.product.title}
              </p>
              <p className="text-[13px] leading-snug" style={{ color: P.ink3 }}>
                {OFFER_COPY.summaryCoreLine}
              </p>
            </div>
            <p className="flex-shrink-0 text-right">
              <span className="block text-[18px] font-black leading-none" style={{ color: P.ink, fontFamily: DISPLAY }}>
                {formatGBP(core.total)}
              </span>
              <span className="text-[11px]" style={{ color: P.ink3 }}>
                {OFFER_COPY.delivered.toLowerCase()}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={core.onStart}
            disabled={core.busy}
            className="mt-3 w-full rounded-xl py-3 text-[15px] font-bold active:scale-[0.98] transition-transform disabled:opacity-60"
            style={{ background: P.accent, color: P.ink, fontFamily: DISPLAY }}
          >
            {OFFER_COPY.startWithThis} →
          </button>
        </div>
      )}

      <div className="px-4 pb-4 pt-3" data-offer-option="stack" style={core ? { borderTop: `1px solid ${P.hairline}` } : undefined}>
        {core && (
          <p className="text-[12px] font-bold" style={{ color: P.accentInk, fontFamily: DISPLAY }}>
            {OFFER_COPY.fullStack}
          </p>
        )}
        <p className="mt-1 text-[14px] leading-snug" style={{ color: P.ink2 }}>
          {OFFER_COPY.summaryStackLine(stack.count)}
        </p>
        {/* Each price says what it buys, so "a month" and "once" never read as two prices for one thing. */}
        {stack.monthly !== null ? (
          <>
            <p className="mt-1 text-[16px] font-bold leading-snug" style={{ color: P.ink, fontFamily: DISPLAY }}>
              {PLAN_COPY.summaryMonthly(stack.monthly, stack.monthlyPct)}
            </p>
            <p className="text-[14px] leading-snug" style={{ color: P.ink2 }}>
              {PLAN_COPY.summaryOnce(stack.oneOff)}
            </p>
          </>
        ) : (
          <p className="mt-1 text-[16px] font-bold leading-snug" style={{ color: P.ink, fontFamily: DISPLAY }}>
            {OFFER_COPY.summaryOnce(stack.oneOff)}
          </p>
        )}
        {gift && (
          <div className="mt-2.5 rounded-xl px-3 py-2.5" style={{ background: P.card, border: `1px solid ${P.hairline}` }} data-offer-gift>
            <p className="flex items-center gap-1.5 text-[13px] font-bold" style={{ color: P.ink, fontFamily: DISPLAY }}>
              <span aria-hidden style={{ color: P.accentInk }}>✦</span>
              {gift.headline}
            </p>
            {gift.moreFor && (
              <p className="mt-1 text-[12px] font-semibold leading-snug" style={{ color: P.ink2 }}>
                {gift.moreFor}
              </p>
            )}
            <p className="mt-1 text-[12px] leading-snug" style={{ color: P.ink3 }}>
              {gift.conditions}{' '}
              <Link href={FREE_GIFT_TERMS_PATH} className="underline underline-offset-2 font-semibold" style={{ color: P.ink2 }}>
                {OFFER_COPY.terms}
              </Link>
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={stack.onSee}
          className="mt-3 w-full rounded-xl py-3 text-[15px] font-bold active:scale-[0.98] transition-transform"
          style={{ background: core ? P.card : P.accent, color: P.ink, border: core ? `1px solid ${P.hairline}` : 'none', fontFamily: DISPLAY }}
        >
          {OFFER_COPY.seeFullStack} ↓
        </button>
      </div>
    </section>
  )
}
