'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import type { ResolvedBasketLine } from '@/lib/basket/types'
import { useBasket } from '@/lib/basket/store'
import { MAX_LINE_QTY } from '@/lib/basket/helpers'
import { formatGBP, getPricingConfig, qualifiesForFreeDelivery, PRICING_CONFIG, type OneOffPricing } from '@/lib/stack-blueprint/pricing'
import { ProductTile } from '@/components/stack-review/ProductTile'
import type { ShopCheckoutState } from '@/hooks/useShopCheckout'
import { PartnerCodeBox, type AppliedCode } from '@/components/checkout/PartnerCodeBox'

const ACCENT = '#00D4FF'
const GREEN = '#34d399'

interface Props {
  resolved: ResolvedBasketLine[]
  subtotal: number
  /** The discounted price — what /api/cart will bill. */
  priced: OneOffPricing
  checkoutState: ShopCheckoutState
  /** A validated partner code, held by the shell so it survives the drawer closing. */
  partnerCode: AppliedCode | null
  onPartnerCode: (applied: AppliedCode | null) => void
  onCheckout: () => void
  onClose: () => void
}

function variantLabel(v: { title: string; flavour: string | null; size: string | null }): string {
  const parts = [v.flavour, v.size].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : v.title
}

/** A right-side slide-in cart drawer: line items up top, the money below. */
export function BasketDrawer({ resolved, subtotal, priced, checkoutState, partnerCode, onPartnerCode, onCheckout, onClose }: Props) {
  /**
   * What each discount is worth in pounds.
   *
   * Derived from the real total rather than from the rates, so the margin floor
   * clipping a line cannot leave the receipt claiming a saving that was not
   * given. The bundle is applied first and the code to what remains — the same
   * order `priceOneOffLines` builds the price in.
   */
  const afterBundle = Math.round(subtotal * (1 - priced.tierPct) * 100) / 100
  const bundleSaving = Math.round((subtotal - afterBundle) * 100) / 100
  const codeSaving = Math.round((priced.discount - bundleSaving) * 100) / 100
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
  const progress = threshold > 0 ? Math.min(1, subtotal / threshold) : 1
  const subscribePct = Math.round(PRICING_CONFIG.subscriptionDiscount * 100)

  const mockDone = checkoutState.status === 'mock-complete'

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
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-muted)] bg-[var(--color-surface-2)] active:scale-90 transition-all" aria-label="Close basket">✕</button>
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
                      <button onClick={() => remove(l.product.id, l.variant.id)} className="text-[11px] flex-shrink-0" style={{ color: 'var(--color-muted)' }} aria-label="Remove">✕</button>
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
              {/* Free-delivery progress */}
              {threshold > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-semibold" style={{ color: freeDelivery ? ACCENT : 'var(--color-text-2)' }}>
                      {freeDelivery ? '✓ Free delivery unlocked' : `${formatGBP(remaining)} away from free delivery`}
                    </span>
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

              <PartnerCodeBox subtotal={subtotal} applied={partnerCode} onChange={onPartnerCode} />

              {/* Show the discounts they've earned, and total at what the card
                  will actually be charged. Both come from `priceOneOffLines`,
                  the same function /api/cart bills Stripe from — including the
                  partner code, so the number here is the number on the card.

                  A LINE EACH. They stack multiplicatively — the bundle comes
                  off first, the code off what is left — which is the order the
                  price is actually built in, so the two lines add up to the
                  total underneath them. Lumping them together left a customer
                  looking at "£21.12 saved" with only 8% of it accounted for. */}
              {priced.discount > 0.01 && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm" style={{ color: 'var(--color-text-2)' }}>Subtotal</span>
                    <span className="text-sm font-semibold" style={{ color: 'var(--color-text-2)' }}>{formatGBP(subtotal)}</span>
                  </div>
                  {bundleSaving > 0.01 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm" style={{ color: GREEN }}>
                        {priced.tierLabel ?? 'Bundle discount'} · {Math.round(priced.tierPct * 100)}% off
                      </span>
                      <span className="text-sm font-bold" style={{ color: GREEN }}>−{formatGBP(bundleSaving)}</span>
                    </div>
                  )}
                  {codeSaving > 0.01 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm" style={{ color: GREEN }}>
                        {partnerCode?.code ?? 'Discount code'} · {Math.round(priced.partnerPct * 100)}% off
                      </span>
                      <span className="text-sm font-bold" style={{ color: GREEN }}>−{formatGBP(codeSaving)}</span>
                    </div>
                  )}
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
                  ? 'Taking you to secure checkout…'
                  : mockDone ? 'Demo checkout ✓' : 'Checkout →'}
              </button>

              {/* Secure-checkout reassurance — honest cues, no surprise steps. */}
              <div className="flex items-center justify-center gap-1.5" style={{ color: 'var(--color-muted)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                <span className="text-[10px] font-semibold">Secure checkout · card &amp; wallet payments, encrypted</span>
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
