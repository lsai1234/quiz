'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import type { ResolvedBasketLine } from '@/lib/basket/types'
import { useBasket } from '@/lib/basket/store'
import { MAX_LINE_QTY } from '@/lib/basket/helpers'
import { formatGBP, getPricingConfig, qualifiesForFreeDelivery, type OneOffPricing } from '@/lib/stack-blueprint/pricing'
import { buildShopPlan, shopPlanTermLine } from '@/lib/checkout/shop-plan'
import { basketGrams, customerDeliveryCharge } from '@/lib/pricing/delivery'
import { founderDeliveryOptions } from '@/lib/founder-codes/codes'
import { PartnerCodeBox, type AppliedCode } from '@/components/checkout/PartnerCodeBox'
import { ProductTile } from '@/components/stack-review/ProductTile'
import { Icon } from '@/components/ui/Icon'
import type { ShopCheckoutState } from '@/hooks/useShopCheckout'
import { PlanRhythms } from './PlanRhythms'
import type { ShopPlanCheckoutState } from '@/hooks/useShopPlanCheckout'
import { useOfferSettings } from '@/hooks/useOfferSettings'
import { addToNextBox, useMyPlan } from '@/hooks/useMyPlan'
import { extraPrice } from '@/lib/hub/extra-price'
import { billingDayOf, billingDayPhrase } from '@/lib/recharge/billing-day'
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
  /** The monthly checkout's progress, when the basket is bought every month. */
  planState?: ShopPlanCheckoutState
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
  planState = { status: 'idle' },
  onCheckout,
  onClose,
}: Props) {
  const { setQty, remove, plan, setPlan, routine, setRoutine } = useBasket()
  /*
    Someone already on a plan: these can go in their next box (paid with that
    box, no delivery charge) or be bought once, never start a second plan. An
    account holds one plan, and checkout refuses a second (`PlanAlreadyExists`).
  */
  const mine = useMyPlan()
  const hasPlan = Boolean(mine.plan && mine.plan.status !== 'cancelled')
  const boxPlan = mine.plan?.status === 'active' && mine.plan.nextBox ? mine.plan : null
  const [intoBox, setIntoBox] = useState(false)
  const [boxBusy, setBoxBusy] = useState(false)
  const [boxDone, setBoxDone] = useState<string | null>(null)
  const [boxError, setBoxError] = useState<string | null>(null)
  useEffect(() => {
    if (hasPlan && plan === 'monthly') setPlan('once')
  }, [hasPlan, plan, setPlan])
  // Member prices on top-ups are a hub service the founders switch on; the
  // monthly plan only promises them while they are on (`GET /api/offer`).
  const { settings: offer } = useOfferSettings()
  const memberPrices = offer.services.deals
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

  /*
    Every month: the same basket at the same price, as a plan (`buildShopPlan`,
    the function the server charges from). A founder code is for one-off orders
    only, so it rules the monthly plan out while it is applied.
  */
  const shopPlan = useMemo(
    () =>
      buildShopPlan(
        resolved.map((l) => ({ productId: l.product.id, variantId: l.variant.id, quantity: l.quantity })),
        products ?? [],
        config,
        undefined,
        routine ? { ...routine, source: 'member' } : null,
      ),
    [resolved, products, config, routine],
  )
  const monthly = plan === 'monthly' && !hasPlan
  const toBox = intoBox && Boolean(boxPlan)
  // At their own plan saving, as the server will charge it (`extraPrice`).
  const boxTotal = Math.round(resolved.reduce((sum, l) => sum + extraPrice(l.product, l.variant, config, boxPlan?.rate ?? undefined) * l.quantity, 0) * 100) / 100

  /** Every unit into the next box, one request each; what went in leaves the basket. */
  const addAllToBox = async () => {
    if (!boxPlan || boxBusy) return
    setBoxBusy(true)
    setBoxError(null)
    let said = ''
    for (const l of resolved) {
      let added = 0
      for (let i = 0; i < l.quantity; i++) {
        const r = await addToNextBox(l.product.id, l.variant.id)
        if (!r.ok) {
          setQty(l.product.id, l.variant.id, l.quantity - added)
          setBoxError(r.message)
          setBoxBusy(false)
          mine.reload()
          return
        }
        said = r.message
        added++
      }
      remove(l.product.id, l.variant.id)
    }
    setBoxDone(`${said.replace(/\s*£[\d.,]+ goes on that payment\.$/, '')} ${formatGBP(boxTotal)} goes on that payment.`.trim())
    setBoxBusy(false)
    mine.reload()
  }
  const monthlyBlock = founderKind ? 'Founder codes are for one-off orders, so this basket can’t be monthly while one is applied.' : !shopPlan.ok ? shopPlan.message : null
  const planReady = monthly && !monthlyBlock && shopPlan.ok
  // A code is checked for one way of buying; switching asks for it again,
  // rather than showing a code as applied to a plan it may not work on.
  const choosePlan = (next: 'once' | 'monthly') => {
    if (next === plan) return
    setPlan(next)
    if (appliedCode) onCodeChange(null)
  }

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
  const belowMinimum = !monthly && !toBox && !founderKind && minimum > 0 && priced.subtotal < minimum && resolved.length > 0
  const shortfall = Math.max(0, Math.round((minimum - priced.subtotal) * 100) / 100)

  const mockDone = checkoutState.status === 'mock-complete'
  const planDone = planState.status === 'mock-complete'
  /** Nothing to pay at all — only a `free` code reaches this. */
  const free = founderKind === 'free' && priced.total + deliveryCharge <= 0

  if (!mounted) return null

  const items = resolved.reduce((n, l) => n + l.quantity, 0)
  const busy = monthly
    ? planState.status === 'loading' || planState.status === 'redirecting'
    : checkoutState.status === 'loading' || checkoutState.status === 'redirecting'

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

        {resolved.length === 0 && planDone ? (
          <div className="sf-drawer-empty" role="status" data-plan-done>
            <p className="sf-drawer-empty-h"><Icon name="check" size={16} /> Your monthly plan is set up.</p>
            <p>It’s in your hub, where you can change anything about it.</p>
            <Link href="/myhub?welcome=1" className="sf-button sf-button--primary sf-button--md">Go to your hub</Link>
            <p className="sf-drawer-secure">Payments aren’t live. This is a demo, and nothing was charged.</p>
          </div>
        ) : resolved.length === 0 && boxDone ? (
          <div className="sf-drawer-empty" role="status" data-box-added>
            <p className="sf-drawer-empty-h"><Icon name="check" size={16} /> In your next box</p>
            <p>{boxDone}</p>
            <Link href="/myhub" className="sf-button sf-button--primary sf-button--md">See your box</Link>
          </div>
        ) : resolved.length === 0 ? (
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
            {/* Not for extras in the next box: they ship with it, with no delivery charge. */}
            {threshold > 0 && !founderKind && !toBox && (
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

              {hasPlan ? (
                /* On a plan already: once, or into the next box. */
                <section className="sf-drawer-planbox" aria-labelledby="basket-plan-h" data-basket-plan data-member-plan>
                  <div className="sf-drawer-planhead">
                    <h3 id="basket-plan-h">How do you want these?</h3>
                    <div className="sf-drawer-seg" role="group" aria-labelledby="basket-plan-h">
                      <button type="button" aria-pressed={!toBox} onClick={() => setIntoBox(false)}>Once</button>
                      <button type="button" aria-pressed={toBox} onClick={() => setIntoBox(true)} disabled={!boxPlan}>In my next box</button>
                    </div>
                  </div>
                  {toBox && boxPlan?.nextBox ? (
                    <ul className="sf-drawer-planlist">
                      <li><Icon name="box" size={15} />Into your box on {new Date(boxPlan.nextBox.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}, added to that box’s payment</li>
                      <li><Icon name="truck" size={15} />No delivery charge: it ships with your box</li>
                      <li><Icon name="calendar" size={15} /><span>Want something every month instead? <Link href="/myhub">Add it to your plan in your hub</Link></span></li>
                    </ul>
                  ) : (
                    <p className="sf-drawer-planwhy">
                      {boxPlan
                        ? 'You’re on a monthly plan, so these can go in your next box instead, with no delivery charge.'
                        : 'Your plan is paused, so these can only be bought once right now. Resume it in your hub to add to a box.'}
                    </p>
                  )}
                </section>
              ) : (
              /* Once or every month. Every month is the same basket at the
                 same price, delivered monthly, with the member hub. */
              <section className="sf-drawer-planbox" aria-labelledby="basket-plan-h" data-basket-plan>
                <div className="sf-drawer-planhead">
                  <h3 id="basket-plan-h">How often?</h3>
                  <div className="sf-drawer-seg" role="group" aria-labelledby="basket-plan-h">
                    <button type="button" aria-pressed={!monthly} onClick={() => choosePlan('once')}>Once</button>
                    <button type="button" aria-pressed={monthly} onClick={() => choosePlan('monthly')}>Every month</button>
                  </div>
                </div>
                {monthly && monthlyBlock ? (
                  <p className="sf-drawer-planwhy">{monthlyBlock}</p>
                ) : monthly && shopPlan.ok ? (
                  /* What happens, in order: today, then each month, then where it's run from. */
                  <ul className="sf-drawer-planlist" data-monthly-how>
                    <li><Icon name="calendar" size={15} />Your first box today, then {formatGBP(shopPlan.monthly)} on {billingDayPhrase(billingDayOf(new Date()))} of each month. Your first box has everything in it.</li>
                    {/* The plan saving: the quiz's own, by the plan's size. */}
                    <li data-plan-saving>
                      <Icon name="percent" size={15} />
                      <span>
                        Subscribe and save {Math.round(shopPlan.rate * 100)}%: {formatGBP(shopPlan.saving)} off a month.
                        {shopPlan.nextBand && ` Plans from ${formatGBP(shopPlan.nextBand.from).replace(/\.00$/, '')} a month save ${Math.round(shopPlan.nextBand.rate * 100)}%.`}
                      </span>
                    </li>
                    <li>
                      <Icon name="refresh" size={15} />
                      <span>
                        Each product comes about when you’d run out, so you never run short and don’t pile up:
                        <PlanRhythms plan={shopPlan.subscription} products={products ?? []} routine={routine} onRoutine={setRoutine} />
                      </span>
                    </li>
                    <li><Icon name="truck" size={15} />{shopPlan.delivery ? `${formatGBP(shopPlan.delivery.price)} delivery a month` : 'Free UK delivery every month'}</li>
                    <li><Icon name="sliders" size={15} />It’s run from your hub: add, swap or remove products, skip a month, pause or cancel any time</li>
                    <li><Icon name="home" size={15} />{memberPrices ? 'The member hub comes with it, with member prices when you top up' : 'The member hub comes with it'}</li>
                    {/* The terms' "Take it off my plan": a shop plan has no
                        answers to choose a safe swap from, so it is said here,
                        before anyone subscribes, and changeable in the hub. */}
                    <li><Icon name="swap" size={15} />If a product becomes unavailable, we take it off your plan and tell you</li>
                    <li><Icon name="check" size={15} /><span>{shopPlanTermLine()}. <Link href="/legal/terms">Plan terms</Link></span></li>
                  </ul>
                ) : (
                  <p className="sf-drawer-planwhy">Every month is the same basket at the same price, delivered monthly, with the member hub.</p>
                )}
              </section>
              )}
            </div>
            </div>

            <div className="sf-drawer-foot">

              {/* The code box, at the top of the money and visible whatever the
                  basket is worth: its whole job is getting a small basket through. */}
              {/* Every month, the code is checked as a plan's is (a partner's
                  code works there, off the first month); once, as a basket's. */}
              {!toBox && (
              <PartnerCodeBox
                key={monthly ? 'monthly' : 'once'}
                subtotal={monthly && shopPlan.ok ? shopPlan.monthly : subtotal}
                channel={monthly ? 'subscription' : 'shop'}
                applied={appliedCode}
                onChange={onCodeChange}
              />
              )}

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

              {/* Every month: the plan's own figures (`buildShopPlan`, what the
                  server charges). A code comes off the first month, as on a
                  quiz plan; the server works out by how much. */}
              {planReady && shopPlan.ok && (
                <>
                  {shopPlan.saving > 0.01 && (
                    <>
                      {/* A month of the plan at shop prices (each product over how
                          often it comes), then the plan saving: they add up to
                          the monthly. Not the basket's one-off figures, which
                          price one of everything, every month. */}
                      <p className="sf-drawer-row">
                        <span>At shop prices, a month</span>
                        <b className="sf-num">{formatGBP(Math.round((shopPlan.monthly + shopPlan.saving) * 100) / 100)}</b>
                      </p>
                      <p className="sf-drawer-row">
                        <span>Plan saving ({Math.round(shopPlan.rate * 100)}%)</span>
                        <b className="sf-num">−{formatGBP(shopPlan.saving)}</b>
                      </p>
                    </>
                  )}
                  {shopPlan.delivery && (
                    <p className="sf-drawer-row">
                      <span>Delivery, every month</span>
                      <b className="sf-num">{formatGBP(shopPlan.delivery.price)}</b>
                    </p>
                  )}
                  {appliedCode && !founderKind && (
                    <p className="sf-drawer-note">{appliedCode.code} comes off your first month at checkout.</p>
                  )}
                  <p className="sf-drawer-row sf-drawer-total">
                    <span>Every month</span>
                    <b className="sf-num">{formatGBP(shopPlan.monthly)}</b>
                  </p>
                </>
              )}

              {/* Into the next box: what goes on that payment, and the one button. */}
              {toBox && boxPlan?.nextBox && (
                <>
                  <p className="sf-drawer-row sf-drawer-total">
                    <span>Added to your next payment</span>
                    <b className="sf-num">{formatGBP(boxTotal)}</b>
                  </p>
                  {boxError && <p className="sf-drawer-error" role="alert">{boxError}</p>}
                  <Button variant="primary" size="lg" fullWidth onClick={addAllToBox} disabled={boxBusy} loading={boxBusy} className="sf-drawer-checkout">
                    <span>{boxBusy ? 'Adding to your box…' : 'Add to my next box'}</span>
                  </Button>
                  <p className="sf-drawer-secure">Nothing to pay now. It’s added to your box’s payment, and you can take it out again in your hub.</p>
                </>
              )}

              {/* The discount, itemised, and the total at what the card will be
                  charged: both from `priceOneOffLines`, the function /api/cart
                  bills Stripe from. Only ever one discount line. */}
              {!monthly && !toBox && priced.discount > 0.01 && (
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
              {!monthly && !toBox && (
                <p className="sf-drawer-row sf-drawer-total">
                  <span>{priced.discount > 0.01 ? 'Total' : 'Subtotal'}</span>
                  <b className="sf-num">{formatGBP(priced.total)}</b>
                </p>
              )}

              {!monthly && checkoutState.status === 'error' && (
                <p className="sf-drawer-error" role="alert">{checkoutState.message}</p>
              )}
              {monthly && planState.status === 'error' && (
                <p className="sf-drawer-error" role="alert">{planState.message}</p>
              )}

              {toBox ? null : planDone ? (
                <div className="sf-drawer-done" role="status">
                  <p><Icon name="check" size={15} /> Your monthly plan is set up.</p>
                  <Link href="/myhub?welcome=1" className="sf-button sf-button--primary sf-button--md sf-button--full">Go to your hub</Link>
                  <p className="sf-drawer-secure">Payments aren’t live. This is a demo, and nothing was charged.</p>
                </div>
              ) : (
                <>
                  <Button variant="primary" size="lg" fullWidth onClick={onCheckout} disabled={busy || (monthly && !planReady)} loading={busy} className="sf-drawer-checkout">
                    <span>
                      {busy
                        ? monthly
                          ? 'Setting up your plan…'
                          : free
                            ? 'Placing your order…'
                            : 'Taking you to secure checkout…'
                        : monthly
                          ? 'Start monthly plan'
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
                    {monthly
                      ? mine.signedIn
                        ? 'You’ll confirm the plan’s terms, then pay securely by card'
                        : 'You’ll make an account, then pay securely by card'
                      : free ? 'Nothing to pay, so no card step' : 'Secure, encrypted checkout with card and wallet payments'}
                  </p>

                  {!monthly && mockDone && (
                    <p className="sf-drawer-secure">Payments aren’t live. This is a demo checkout.</p>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
