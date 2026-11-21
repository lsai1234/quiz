'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import type { ResolvedBasketLine } from '@/lib/basket/types'
import { useBasket } from '@/lib/basket/store'
import { MAX_LINE_QTY } from '@/lib/basket/helpers'
import { formatGBP, getPricingConfig, qualifiesForFreeDelivery, PRICING_CONFIG, type OneOffPricing } from '@/lib/stack-blueprint/pricing'
import { basketGrams, customerDeliveryCharge } from '@/lib/pricing/delivery'
import { founderDeliveryOptions } from '@/lib/founder-codes/codes'
import { PartnerCodeBox, type AppliedCode } from '@/components/checkout/PartnerCodeBox'
import { ProductTile } from '@/components/stack-review/ProductTile'
import { Icon } from '@/components/ui/Icon'
import type { ShopCheckoutState } from '@/hooks/useShopCheckout'
import type { CatalogueProduct, StackSlot } from '@/lib/catalogue/types'
import type { BasketNudge } from '@/lib/shop/basket-alchemy'
import { ShopBasketNudge } from './ShopBasketNudge'
import { ShopStackRadar } from './ShopStackRadar'
import { Button } from '@/components/storefront'

/*
 * A discount is not a semantic tone in this palette — there is no green, and
 * inventing one for a saving would be the tenth colour. It reads as ordinary
 * text; the minus sign in front of it is what says which direction it goes.
 */
const GREEN = 'var(--text)'

interface Props {
  resolved: ResolvedBasketLine[]
  subtotal: number
  /** The discounted price — what /api/cart will bill. */
  priced: OneOffPricing
  /** What we pay PowerBody for these goods, ex VAT — what a cost-price code ships on. */
  supplierValue: number
  appliedCode: AppliedCode | null
  onCodeChange: (applied: AppliedCode | null) => void
  /**
   * What the basket is close to being. Bundles only — this drawer draws its own
   * free-delivery ladder below, and saying the same thing twice in one view is
   * noise. See `lib/shop/basket-alchemy`.
   */
  nudge?: BasketNudge | null
  onNudgeAct?: () => void
  onNudgeDismiss?: () => void
  /** The catalogue, for the Stack Radar's coverage reading. */
  products?: CatalogueProduct[]
  /** Browse the shop filtered to a slot — the drawer closes on the way. */
  onBrowseSlot?: (slot: StackSlot) => void
  checkoutState: ShopCheckoutState
  onCheckout: () => void
  onClose: () => void
}

function variantLabel(v: { title: string; flavour: string | null; size: string | null }): string {
  const parts = [v.flavour, v.size].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : v.title
}

/** A right-side slide-in cart drawer: line items up top, the money below. */
export function BasketDrawer({
  resolved,
  subtotal,
  priced,
  supplierValue,
  appliedCode,
  nudge,
  onNudgeAct,
  onNudgeDismiss,
  products,
  onBrowseSlot,
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
    ? founderDeliveryOptions(founderKind, { supplierValue, grams: basketGrams(resolved, config), orderValue: priced.total }, config)[0]?.price ?? 0
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

  const items = resolved.reduce((n, l) => n + l.quantity, 0)
  const busy = checkoutState.status === 'loading' || checkoutState.status === 'redirecting'

  return createPortal(
    <div
      className="storefront sf-drawer-scrim"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ opacity: shown ? 1 : 0, transition: reduced ? 'none' : 'opacity 0.25s ease' }}
    >
      <div
        className="sf-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="basket-title"
        style={{
          transform: shown ? 'translateX(0)' : 'translateX(100%)',
          transition: reduced ? 'none' : 'transform 0.45s cubic-bezier(0.22,1,0.36,1)' }}
      >
        <div className="sf-drawer-head">
          <h2 id="basket-title">Your basket</h2>
          {items > 0 && <span className="sf-num">{items} item{items !== 1 ? 's' : ''}</span>}
          <button type="button" className="sf-icon-button" aria-label="Close basket" onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </div>

        {resolved.length === 0 ? (
          <div className="sf-drawer-empty">
            <p className="sf-drawer-empty-h">Your basket is empty</p>
            <p>Add something from the shelves to get started.</p>
            <Button variant="primary" size="md" onClick={onClose}>Keep shopping</Button>
          </div>
        ) : (
          <>
            {/* Free-delivery progress, at the top where it is read first.
                Hidden under a founder code: under one of those the postage is
                either nothing or our supplier's actual charge, and neither is
                "£12 away from free delivery". */}
            {threshold > 0 && !founderKind && (
              <div className="sf-drawer-meter">
                <p>
                  <span>
                    {freeDelivery
                      ? <><Icon name="check" size={13} /> Free UK delivery</>
                      : `${formatGBP(remaining)} away from free delivery`}
                  </span>
                  {/* What postage actually costs on this basket, so the first
                      time anyone sees a delivery line is not on Stripe's page. */}
                  <b className="sf-num">{freeDelivery ? `Over ${formatGBP(threshold)}` : `+${formatGBP(deliveryCharge)} delivery`}</b>
                </p>
                <span className="sf-drawer-pour" aria-hidden>
                  <i style={{ transform: `scaleX(${progress})`, transition: reduced ? 'none' : undefined }} />
                </span>
              </div>
            )}

            {/* The lines, and below them what the basket covers and could be;
                only the money is pinned to the bottom. */}
            <div className="sf-drawer-scroll">
            <ul className="sf-drawer-lines">
              {resolved.map((l) => (
                <li key={`${l.product.id}:${l.variant.id}`} className="sf-drawer-line">
                  <span className="sf-drawer-thumb">
                    <ProductTile imageUrl={l.variant.imageUrl ?? l.product.imageUrl} formats={l.product.formats} title={l.product.title} size={160} fill plate />
                  </span>
                  <div className="sf-drawer-line-words">
                    <p className="sf-name sf-clamp-2">{l.product.title}</p>
                    <p className="sf-drawer-variant">{variantLabel(l.variant)}</p>
                    <div className="sf-drawer-qty" role="group" aria-label={`${l.product.title}, quantity`}>
                      <button type="button" onClick={() => setQty(l.product.id, l.variant.id, l.quantity - 1)} aria-label={l.quantity === 1 ? `Remove ${l.product.title}` : `One fewer ${l.product.title}`}>
                        <Icon name="dash" size={14} />
                      </button>
                      <span className="sf-num">{l.quantity}</span>
                      <button type="button" onClick={() => setQty(l.product.id, l.variant.id, Math.min(MAX_LINE_QTY, l.quantity + 1))} disabled={l.quantity >= MAX_LINE_QTY} aria-label={`One more ${l.product.title}`}>
                        <Icon name="plus" size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="sf-drawer-line-end">
                    <span className="sf-price">{formatGBP(l.lineTotal)}</span>
                    <button type="button" className="sf-drawer-remove" onClick={() => remove(l.product.id, l.variant.id)} aria-label={`Remove ${l.product.title}`}>
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="sf-drawer-extras">
              {/* What this basket IS, before what it could be. */}
              {products && onBrowseSlot && (
                <ShopStackRadar resolved={resolved} products={products} onBrowseSlot={onBrowseSlot} />
              )}

              {/* What this basket is close to being. Bundles only: this drawer
                  draws its own free-delivery line above. */}
              {nudge && (
                <ShopBasketNudge
                  nudge={nudge}
                  onAct={() => onNudgeAct?.()}
                  onDismiss={() => onNudgeDismiss?.()}
                />
              )}

              {/* Subscribe-&-save, to the personalised quiz */}
              <Link href="/quiz" data-interactive className="sf-drawer-plan">
                <Icon name="calendar" size={18} />
                <span>Want it monthly? Subscribe &amp; save up to {subscribePct}% with a personalised stack</span>
                <Icon name="chevron-right" size={15} />
              </Link>
            </div>
            </div>

            <div className="sf-drawer-foot">

              {/* The code box, at the top of the money and visible whatever the
                  basket is worth: its whole job is getting a small basket through. */}
              <PartnerCodeBox
                subtotal={subtotal}
                channel="shop"
                applied={appliedCode}
                onChange={onCodeChange}
              />

              {belowMinimum && (
                <p className="sf-drawer-note">
                  Orders start at {formatGBP(minimum)}. {formatGBP(shortfall)} to go.
                </p>
              )}

              {/* Under a founder code the postage is not the customer ladder, so
                  it is its own line rather than progress towards an offer. */}
              {founderKind && (
                <p className="sf-drawer-row">
                  <span>{founderKind === 'cost' ? 'Delivery at cost' : 'Delivery'}</span>
                  <b className="sf-num">{deliveryCharge > 0 ? formatGBP(deliveryCharge) : 'Free'}</b>
                </p>
              )}

              {/* The discount, itemised, and the total at what the card will be
                  charged: both from `priceOneOffLines`, the function /api/cart
                  bills Stripe from. Only ever one discount line. */}
              {priced.discount > 0.01 && (
                <>
                  <p className="sf-drawer-row">
                    <span>Subtotal</span>
                    <b className="sf-num">{formatGBP(subtotal)}</b>
                  </p>
                  <p className="sf-drawer-row">
                    {/* A founder code replaces the prices; it is named by what
                        it is rather than as "0% off". */}
                    <span style={{ color: GREEN }}>
                      {founderKind
                        ? appliedCode?.founderLabel ?? 'Founder code'
                        : appliedCode && priced.partnerPct > 0 && priced.partnerPct >= priced.tierPct
                        ? `${appliedCode.code}, ${Math.round(priced.partnerPct * 100)}% off`
                        : `${priced.tierLabel ?? 'Bundle discount'}, ${Math.round(priced.tierPct * 100)}% off`}
                    </span>
                    <b className="sf-num" style={{ color: GREEN }}>−{formatGBP(priced.discount)}</b>
                  </p>
                </>
              )}
              <p className="sf-drawer-row sf-drawer-total">
                <span>{priced.discount > 0.01 ? 'Total' : 'Subtotal'}</span>
                <b className="sf-num">{formatGBP(priced.total)}</b>
              </p>

              {checkoutState.status === 'error' && (
                <p className="sf-drawer-error" role="alert">{checkoutState.message}</p>
              )}

              <Button variant="primary" size="lg" fullWidth onClick={onCheckout} disabled={busy} loading={busy} className="sf-drawer-checkout">
                <span>
                  {busy
                    ? free
                      ? 'Placing your order…'
                      : 'Taking you to secure checkout…'
                    : mockDone
                      ? 'Demo checkout'
                      : free
                        ? 'Place order (nothing to pay)'
                        : 'Checkout'}
                </span>
                {!busy && <Icon name="lock" size={16} />}
              </Button>

              {/* Honest cues, no surprise steps — and no card step promised on
                  an order with no payment in it. */}
              <p className="sf-drawer-secure">
                <Icon name="lock" size={13} />
                {free ? 'Nothing to pay, so no card step' : 'Secure, encrypted checkout with card and wallet payments'}
              </p>

              {mockDone && (
                <p className="sf-drawer-secure">Payments aren’t live. This is a demo checkout.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
