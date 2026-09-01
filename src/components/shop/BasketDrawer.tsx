'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import type { ResolvedBasketLine } from '@/lib/basket/types'
import { useBasket } from '@/lib/basket/store'
import { MAX_LINE_QTY } from '@/lib/basket/helpers'
import { formatGBP, getPricingConfig, qualifiesForFreeDelivery, PRICING_CONFIG, type OneOffPricing } from '@/lib/stack-blueprint/pricing'
import { customerDeliveryCharge } from '@/lib/pricing/delivery'
import { founderDeliveryOptions } from '@/lib/founder-codes/codes'
import { PartnerCodeBox, type AppliedCode } from '@/components/checkout/PartnerCodeBox'
import { ProductTile } from '@/components/stack-review/ProductTile'
import { IconButton } from '@/components/ui/IconButton'
import { Icon } from '@/components/ui/Icon'
import type { ShopCheckoutState } from '@/hooks/useShopCheckout'

const ACCENT = '#00D4FF'
const GREEN = '#34d399'

interface Props {
  resolved: ResolvedBasketLine[]
  subtotal: number
  /** The discounted price — what /api/cart will bill. */
  priced: OneOffPricing
  /** What we pay PowerBody for these goods, ex VAT — what a cost-price code ships on. */
  supplierValue: number
  appliedCode: AppliedCode | null
  onCodeChange: (applied: AppliedCode | null) => void
  checkoutState: ShopCheckoutState
  onCheckout: () => void
  onClose: () => void
}

function variantLabel(v: { title: string; flavour: string | null; size: string | null }): string {
  const parts = [v.flavour, v.size].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : v.title
}

/** A right-side slide-in cart drawer: line items up top, the money below. */
export function BasketDrawer({
  resolved,
  subtotal,
  priced,
  supplierValue,
  appliedCode,
  onCodeChange,
  checkoutState,
  onCheckout,
  onClose,
}: Props) {
  const { setQty, remove } = useBasket()
  const [mounted, setMounted] = useState(false)
  const [shown, setShown] = useState(false)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    setMounted(true)
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const config = getPricingConfig()
  const threshold = config.freeDeliveryThreshold
  const freeDelivery = qualifiesForFreeDelivery(subtotal, config)
  const remaining = Math.max(0, Math.round((threshold - subtotal) * 100) / 100)
  const founderKind = appliedCode?.founderKind ?? null
  // The mainland rate — the one all but ~4% of baskets pay, and the one Stripe
  // will show as the default choice. A Highlands address picks the surcharged
  // option there.
  //
  // A founder code moves this, and for a cost-price one it moves it UP: the
  // parcel is charged at what PowerBody charge US rather than at our customer
  // rate. Read from the same function `/api/cart` books the shipping line from,
  // so the two cannot disagree.
  const deliveryCharge = founderKind
    ? founderDeliveryOptions(founderKind, { supplierValue, orderValue: priced.total }, config)[0]?.price ?? 0
    : customerDeliveryCharge(subtotal, 'uk-1', config)
  const progress = threshold > 0 ? Math.min(1, subtotal / threshold) : 1
  const subscribePct = Math.round(PRICING_CONFIG.subscriptionDiscount * 100)

  /**
   * Below the minimum order, and said HERE rather than after a failed checkout.
   *
   * `/api/cart` has always refused these baskets, but only once "Checkout" had
   * been pressed — so the way to find out the minimum existed was to hit it.
   * Worse, the code box that can waive it lived only on the quiz and bundle
   * screens, so the one journey where a small basket is normal was also the one
   * with no way to say anything about it.
   *
   * A founder code clears it, which is why the notice reads as a fact about the
   * basket rather than an error, and why it disappears the moment one applies.
   */
  const minimum = config.minOrderValue
  // Judged on the UNDISCOUNTED subtotal, which is the expression `/api/cart`
  // refuses on. Measuring the discounted total here would put a basket through
  // this notice that the checkout then let past, or the reverse.
  const belowMinimum = !founderKind && minimum > 0 && priced.subtotal < minimum && resolved.length > 0
  const shortfall = Math.max(0, Math.round((minimum - priced.subtotal) * 100) / 100)

  const mockDone = checkoutState.status === 'mock-complete'
  /** Nothing to pay at all — only a `free` code reaches this. */
  const free = founderKind === 'free' && priced.total + deliveryCharge <= 0

  if (!mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex justify-end"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ background: 'rgba(0,0,0,0.6)', opacity: shown ? 1 : 0, transition: reduced ? 'none' : 'opacity 0.25s ease' }}
    >
      <div
        className="w-full max-w-[420px] h-full flex flex-col"
        style={{
          background: 'var(--color-bg)',
          borderLeft: '1px solid var(--color-border)',
          transform: shown ? 'translateX(0)' : 'translateX(100%)',
          transition: reduced ? 'none' : 'transform 0.3s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 flex items-center justify-between flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <h2 className="text-lg font-black" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}>
            Your basket
          </h2>
          <IconButton icon="x" label="Close basket" size="sm" filled onClick={onClose} />
        </div>

        {resolved.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
            <p className="text-sm font-bold" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>Your basket is empty</p>
            <p className="text-xs mt-1.5" style={{ color: 'var(--color-muted)' }}>Add something from the shelves to get started.</p>
            <button onClick={onClose} className="mt-5 px-5 py-2.5 rounded-xl text-xs font-bold active:scale-95 transition-transform" style={{ background: 'var(--color-accent)', color: 'var(--color-bg)', fontFamily: 'var(--font-display)' }}>
              Keep shopping
            </button>
          </div>
        ) : (
          <>
            {/* Line items */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {resolved.map((l) => (
                <div key={`${l.product.id}:${l.variant.id}`} className="flex gap-3">
                  <ProductTile imageUrl={l.product.imageUrl} slot={l.product.stackSlots[0]} title={l.product.title} size={56} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold leading-snug line-clamp-2" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>{l.product.title}</p>
                      <IconButton icon="x" label={`Remove ${l.product.title}`} size="sm" onClick={() => remove(l.product.id, l.variant.id)} className="-mr-1 -mt-1" />
                    </div>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-muted)' }}>{variantLabel(l.variant)}</p>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center rounded-lg" style={{ border: '1px solid var(--color-border-2)' }}>
                        <button onClick={() => setQty(l.product.id, l.variant.id, l.quantity - 1)} className="w-7 h-7 active:opacity-60" style={{ color: 'var(--color-text-2)' }} aria-label="Decrease">–</button>
                        <span className="w-6 text-center text-xs font-bold" style={{ fontFamily: 'var(--font-display)' }}>{l.quantity}</span>
                        <button onClick={() => setQty(l.product.id, l.variant.id, Math.min(MAX_LINE_QTY, l.quantity + 1))} className="w-7 h-7 active:opacity-60" style={{ color: 'var(--color-text-2)' }} aria-label="Increase">+</button>
                      </div>
                      <span className="text-sm font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>{formatGBP(l.lineTotal)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3" style={{ borderTop: '1px solid var(--color-border)' }}>
              {/* Free-delivery progress. Hidden under a founder code: the offer
                  is a customer-facing ladder, and under one of these codes the
                  postage is either nothing or our supplier's actual charge —
                  neither of which "£12 away from free delivery" describes. */}
              {threshold > 0 && !founderKind && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-semibold" style={{ color: freeDelivery ? ACCENT : 'var(--color-text-2)' }}>
                      {freeDelivery ? <><Icon name="check" size={12} className="inline-block -mt-0.5 mr-1" />Free delivery unlocked</> : `${formatGBP(remaining)} away from free delivery`}
                    </span>
                    {/* What postage actually costs on this basket. It used to say
                        only how far off free delivery was, while charging nothing
                        either way — so the first time anyone saw a delivery line
                        was on Stripe's page. */}
                    {!freeDelivery && (
                      <span className="text-[11px] font-semibold" style={{ color: 'var(--color-muted)' }}>
                        +{formatGBP(deliveryCharge)} delivery
                      </span>
                    )}
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-2)' }}>
                    <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: ACCENT, transition: reduced ? 'none' : 'width 0.4s ease' }} />
                  </div>
                </div>
              )}

              {/* Subscribe-&-save nudge → the personalised quiz */}
              <Link
                href="/"
                className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-[11px] font-semibold active:scale-[0.99] transition-transform"
                style={{ color: ACCENT, background: `color-mix(in srgb, ${ACCENT} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${ACCENT} 20%, transparent)` }}
              >
                <span className="flex-1">Want it monthly? Subscribe &amp; save up to {subscribePct}% with a personalised stack</span>
                <span aria-hidden>→</span>
              </Link>

              {/* The code box, at the top of the money and visible whatever the
                  basket is worth.

                  It did not exist here at all, and there was no way to reach a
                  code box in the shop under £15 — the checkout refused the
                  basket before any screen carrying one was rendered. That is
                  precisely backwards for the code whose entire job is getting a
                  small basket through. */}
              <PartnerCodeBox
                subtotal={subtotal}
                channel="shop"
                applied={appliedCode}
                onChange={onCodeChange}
              />

              {belowMinimum && (
                <p className="text-[11px]" style={{ color: 'var(--color-text-2)' }}>
                  Orders start at {formatGBP(minimum)} — {formatGBP(shortfall)} to go.
                </p>
              )}

              {/* Under a founder code the postage is not the customer ladder, so
                  it is stated as its own line rather than as progress towards an
                  offer that no longer applies. */}
              {founderKind && (
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: 'var(--color-text-2)' }}>
                    {founderKind === 'cost' ? 'Delivery at cost' : 'Delivery'}
                  </span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--color-text-2)' }}>
                    {deliveryCharge > 0 ? formatGBP(deliveryCharge) : 'Free'}
                  </span>
                </div>
              )}

              {/* Show the discount they've earned, and total at what the card
                  will actually be charged. Both come from `priceOneOffLines`,
                  the same function /api/cart bills Stripe from, so the number
                  here is the number on the card.

                  Named and itemised rather than a lump "you saved £x": a saving
                  a customer cannot account for reads as marketing. There is
                  only ever one line — a shop basket earns the bundle tier and
                  nothing else, because partner codes do not apply here. */}
              {priced.discount > 0.01 && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm" style={{ color: 'var(--color-text-2)' }}>Subtotal</span>
                    <span className="text-sm font-semibold" style={{ color: 'var(--color-text-2)' }}>{formatGBP(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    {/* A founder code has no tier and no rate — it replaces the
                        prices. Naming it "0% off" would be a lie about a line
                        that took £48 off, so it is named by what it is. */}
                    <span className="text-sm" style={{ color: GREEN }}>
                      {founderKind
                        ? appliedCode?.founderLabel ?? 'Founder code'
                        : `${priced.tierLabel ?? 'Bundle discount'} · ${Math.round(priced.tierPct * 100)}% off`}
                    </span>
                    <span className="text-sm font-bold" style={{ color: GREEN }}>−{formatGBP(priced.discount)}</span>
                  </div>
                </>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold" style={{ color: 'var(--color-text-2)' }}>
                  {priced.discount > 0.01 ? 'Total' : 'Subtotal'}
                </span>
                <span className="text-xl font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>{formatGBP(priced.total)}</span>
              </div>

              {checkoutState.status === 'error' && (
                <p className="text-[11px] text-center" style={{ color: 'var(--color-red)' }}>{checkoutState.message}</p>
              )}

              <button
                onClick={onCheckout}
                disabled={checkoutState.status === 'loading' || checkoutState.status === 'redirecting'}
                className="w-full py-4 rounded-2xl text-sm font-bold tracking-wide active:scale-95 transition-all disabled:opacity-60 disabled:cursor-wait"
                style={{ background: 'var(--color-accent)', color: 'var(--color-bg)', fontFamily: 'var(--font-display)' }}
              >
                {checkoutState.status === 'loading' || checkoutState.status === 'redirecting'
                  ? free
                    ? 'Placing your order…'
                    : 'Taking you to secure checkout…'
                  : mockDone
                    ? 'Demo checkout'
                    : free
                      ? 'Place order (nothing to pay) →'
                      : 'Checkout →'}
              </button>

              {/* Secure-checkout reassurance — honest cues, no surprise steps.
                  Which means not promising a card step on an order that has no
                  payment in it at all. */}
              <div className="flex items-center justify-center gap-1.5" style={{ color: 'var(--color-muted)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                <span className="text-[10px] font-semibold">
                  {free
                    ? 'Nothing to pay — no card step'
                    : 'Secure checkout · card & wallet payments, encrypted'}
                </span>
              </div>

              {mockDone && (
                <p className="text-[10px] text-center" style={{ color: 'var(--color-muted)' }}>
                  Payments aren’t live — this is a demo checkout.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
