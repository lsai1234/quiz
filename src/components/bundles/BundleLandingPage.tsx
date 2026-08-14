'use client'

import { Icon } from '@/components/ui/Icon'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import type { PrebuiltBundle, BundleAddOn } from '@/lib/bundles'
import type { StackBlueprint, StackSlotEntry } from '@/lib/stack-blueprint'
import { updateStackSlotVariant, removeOptionalSlot } from '@/lib/stack-blueprint/helpers'
import { calculatePricing, buildSubscriptionPlan, formatGBP } from '@/lib/stack-blueprint/pricing'
import { selectStatAxes } from '@/lib/stack-stats'
import type { PlanType } from '@/lib/store'
import { useCatalogueProducts } from '@/hooks/useCatalogueProducts'
import { useStackCheckout } from '@/hooks/useStackCheckout'
import { PartnerCodeBox, type AppliedCode } from '@/components/checkout/PartnerCodeBox'
import { StackDeck } from '@/components/stack-review/StackDeck'
import { PlanReceipt } from '@/components/stack-review/PlanReceipt'
import { SubscriptionProtocol } from '@/components/stack-review/SubscriptionProtocol'
import { ScratchToReveal, scratchRevealAvailable } from '@/components/stack-review/ScratchToReveal'
import { CheckoutSuccess } from '@/components/stack-review/CheckoutSuccess'
import { receiptItemsFromSlots } from '@/lib/receipt/build'
import { AccountGate } from '@/components/auth/AccountGate'
import { ConsentGate } from '@/components/legal/ConsentGate'
import { BundleHero } from './BundleHero'
import { BundleAddOnCard } from './BundleAddOnCard'
import { WorkoutSection } from './WorkoutSection'
import { BundleHowTo } from './BundleHowTo'

interface Props {
  bundle: PrebuiltBundle
}

/**
 * Landing page for a prebuilt, creator-led bundle. It reuses the Act 4 stack
 * review surface — the top-trumps deck, the receipt, the sticky checkout bar —
 * so a bundle reads exactly like a personalised stack, then adds the content
 * that sells it: the hero story, the optional add-ons, the matching workout and
 * the how-to routine.
 *
 * The stack is fixed data from the bundle definition, held in LOCAL state so the
 * quiz funnel's global store is never touched. Visitors can pick flavours and
 * toggle the optional add-ons; the core products can't be swapped or removed.
 */
export function BundleLandingPage({ bundle }: Props) {
  const { products } = useCatalogueProducts()
  const [rawBlueprint, setBlueprint] = useState<StackBlueprint>(bundle.blueprint)
  const [planType, setPlanType] = useState<PlanType>('oneoff')
  const [revealedIntroDiscount, setRevealedIntroDiscount] = useState<number | null>(null)
  const stackRef = useRef<HTMLDivElement>(null)
  const summaryRef = useRef<HTMLDivElement>(null)

  // A new bundle (e.g. navigating between bundle pages) resets local state.
  useEffect(() => {
    setBlueprint(bundle.blueprint)
    setPlanType('oneoff')
    setRevealedIntroDiscount(null)
  }, [bundle.blueprint])

  // Portal the sticky bar to <body> so `position: fixed` anchors to the viewport
  // even when an ancestor is transformed.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Default any slot without a selected variant to the product's first available
  // variant so the picker and the price always agree.
  const blueprint = useMemo(() => {
    let result = rawBlueprint
    for (const slot of rawBlueprint.slots) {
      if (slot.selectedVariantId) continue
      const product = products.find((p) => p.id === slot.selectedProductId)
      const defaultVariant = product?.variants.find((v) => v.available)
      if (defaultVariant) result = updateStackSlotVariant(result, slot.slotId, defaultVariant.id)
    }
    return result
  }, [rawBlueprint, products])

  const handleChangeVariant = useCallback((slotId: string, variantId: string) => {
    setBlueprint((prev) => updateStackSlotVariant(prev, slotId, variantId))
  }, [])

  const handleAddAddOn = useCallback(
    (addOn: BundleAddOn) => {
      const product = products.find((p) => p.id === addOn.productId)
      if (!product) return
      const firstVariant = product.variants.find((v) => v.available) ?? product.variants[0]
      setBlueprint((prev) => {
        if (prev.slots.some((s) => s.slotId === addOn.slotId)) return prev
        const maxOrder = prev.slots.reduce((max, s) => Math.max(max, s.displayOrder), 0)
        const slot: StackSlotEntry = {
          slotId: addOn.slotId,
          slotType: addOn.slotType,
          title: addOn.title,
          description: addOn.reason,
          recommendedProductId: product.id,
          selectedProductId: product.id,
          selectedVariantId: firstVariant?.id ?? null,
          required: false,
          canRemove: true,
          canSwap: false,
          swapGroup: product.swapGroup,
          reason: addOn.reason,
          confidenceScore: 60,
          displayOrder: maxOrder + 1,
        }
        return { ...prev, slots: [...prev.slots, slot] }
      })
    },
    [products],
  )

  const handleRemove = useCallback((slotId: string) => {
    setBlueprint((prev) => {
      try {
        return removeOptionalSlot(prev, slotId)
      } catch {
        return prev // required slot — the button shouldn't appear for these
      }
    })
  }, [])

  const { state: checkoutState, checkout, resume: resumeCheckout, reset: resetCheckout } = useStackCheckout()

  // A partner's code, once validated. Feeds both the receipt and the checkout,
  // so what is shown and what is charged come from the same number.
  const [partnerCode, setPartnerCode] = useState<AppliedCode | null>(null)

  const subOpts = useMemo(
    () => ({
      introDiscountOverride: revealedIntroDiscount,
      partnerDiscountPct: partnerCode?.discountPct ?? null,
      partnerCode: partnerCode?.code ?? null,
    }),
    [revealedIntroDiscount, partnerCode],
  )

  const handleCheckout = useCallback(
    () => checkout(blueprint, products, planType, null, subOpts),
    [checkout, blueprint, products, planType, subOpts],
  )

  const sortedSlots = useMemo(
    () => [...blueprint.slots].sort((a, b) => a.displayOrder - b.displayOrder),
    [blueprint.slots],
  )
  const statAxes = useMemo(() => selectStatAxes(blueprint, products), [blueprint, products])
  const pricing = calculatePricing(blueprint, products, null, undefined, subOpts)
  const subscriptionPlan = useMemo(
    () => buildSubscriptionPlan(blueprint, products, null, undefined, subOpts),
    [blueprint, products, subOpts],
  )
  const slotTitleById = Object.fromEntries(blueprint.slots.map((s) => [s.slotId, s.title]))
  const slotIds = new Set(blueprint.slots.map((s) => s.slotId))

  const addOns = bundle.addOns
    .map((addOn) => ({ addOn, product: products.find((p) => p.id === addOn.productId) }))
    .filter((a): a is { addOn: BundleAddOn; product: NonNullable<typeof a.product> } => !!a.product)

  // Sticky bar mirrors the stack review: the active plan's headline total + a
  // one-tap path to checkout.
  const stickyIsSub = planType === 'subscription'
    && pricing.subscriptionItemCount > 0
    && pricing.subscriptionMinOrderMet
  const stickyTotal = stickyIsSub ? pricing.subscriptionTotal : pricing.oneOffTotal
  const showStickyBar = checkoutState.status !== 'needs-account'
    && checkoutState.status !== 'needs-consent'
    && checkoutState.status !== 'mock-complete'

  // Mock payments only — a real payment confirms on /order/confirmation.
  if (checkoutState.status === 'mock-complete') {
    return (
      <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
        <CheckoutSuccess
          plan={checkoutState.plan}
          mock
          subscription={checkoutState.subscription}
          oneOff={{
            items: receiptItemsFromSlots(blueprint.slots, products),
            subtotal: pricing.oneOffSubtotal,
            total: pricing.oneOffTotal,
          }}
          onBack={resetCheckout}
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-28" style={{ background: 'var(--color-bg)' }}>
      {/* Minimal brand header — first-time visitors can land here cold */}
      <header
        className="sticky top-0 z-30 border-b border-[var(--color-border)]"
        style={{
          background: 'color-mix(in srgb, var(--color-bg) 88%, transparent)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <div className="max-w-lg mx-auto px-5 py-3.5 flex items-center justify-between">
          <Link
            href="/shop"
            className="text-xs font-semibold active:opacity-70 transition-opacity"
            style={{ color: 'var(--color-muted)' }}
          >
            ← Shop
          </Link>
          <span
            className="text-base font-black tracking-tight"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}
          >
            getCHRGD
          </span>
          <Link
            href="/"
            className="text-xs font-semibold active:opacity-70 transition-opacity"
            style={{ color: 'var(--color-muted)' }}
          >
            Build your own →
          </Link>
        </div>
      </header>

      <BundleHero bundle={bundle} productCount={sortedSlots.length} totalPrice={pricing.oneOffTotal} />

      <div className="h-px bg-[var(--color-border)] mx-5" />

      {/* What's inside — the top-trumps deck (Act 4 surface) */}
      <div ref={stackRef} className="pt-7" style={{ scrollMarginTop: 16 }}>
        <p
          className="px-5 max-w-lg mx-auto text-[10px] font-bold tracking-widest uppercase text-[var(--color-muted)] mb-1"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          What&apos;s inside — {sortedSlots.length} products · swipe to compare
        </p>
        <p className="px-5 max-w-lg mx-auto text-xs leading-relaxed mb-4" style={{ color: 'var(--color-text-2)' }}>
          Tap a card for the detail and to pick your flavours — everything arrives together in one order.
        </p>
        <StackDeck
          slots={sortedSlots}
          products={products}
          planType={planType}
          axes={statAxes}
          onChangeVariant={handleChangeVariant}
          onRemove={handleRemove}
        />
      </div>

      {/* Optional add-ons */}
      {addOns.length > 0 && (
        <div className="px-5 pt-8 max-w-lg mx-auto space-y-3">
          <p
            className="text-[10px] font-bold tracking-widest uppercase"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--color-muted)' }}
          >
            Make it yours — optional add-ons
          </p>
          {addOns.map(({ addOn, product }) => (
            <BundleAddOnCard
              key={addOn.slotId}
              addOn={addOn}
              product={product}
              added={slotIds.has(addOn.slotId)}
              onAdd={handleAddAddOn}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}

      {/* The gym routine that goes with the stack */}
      <WorkoutSection workout={bundle.workout} seriesName={bundle.seriesName} />

      <BundleHowTo steps={bundle.howToUse} />

      <div className="h-px bg-[var(--color-border)] mx-5 mt-8" />

      {/* Price summary + checkout — the Act 4 receipt */}
      <div ref={summaryRef} id="scene-plan" className="px-5 pt-6 max-w-lg mx-auto scroll-mt-20">
        <p
          className="text-[10px] font-bold tracking-widest uppercase mb-4"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--color-muted)' }}
        >
          Checkout — one-off or monthly
        </p>

        {checkoutState.status === 'error' && (
          <div className="mb-4 rounded-xl border border-[var(--color-red)]/30 bg-[var(--color-red)]/8 px-4 py-3 space-y-1">
            {checkoutState.messages.map((msg, i) => (
              <p key={i} className="text-xs text-[var(--color-red)] leading-relaxed">{msg}</p>
            ))}
            <button
              onClick={resetCheckout}
              className="text-[10px] font-semibold text-[var(--color-red)]/70 underline mt-1"
            >
              Dismiss
            </button>
          </div>
        )}

        {planType === 'subscription' && scratchRevealAvailable() && subscriptionPlan.length > 0 && (
          <ScratchToReveal
            monthlyTotal={pricing.subscriptionTotal}
            revealed={revealedIntroDiscount}
            onReveal={setRevealedIntroDiscount}
          />
        )}

        {/* Above the receipt, so the totals below already include it. */}
        <div className="mb-3 flex flex-col">
          <PartnerCodeBox
            subtotal={planType === 'subscription' ? pricing.subscriptionTotal : pricing.oneOffSubtotal}
            applied={partnerCode}
            onChange={setPartnerCode}
          />
        </div>

        <PlanReceipt
          slots={sortedSlots}
          products={products}
          subscriptionPlan={subscriptionPlan}
          slotTitleById={slotTitleById}
          pricing={pricing}
          planType={planType}
          onPlanChange={setPlanType}
          onCheckout={handleCheckout}
          partnerCode={partnerCode?.code ?? null}
          onCustomise={() => stackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          isLoading={checkoutState.status === 'loading'}
        />

        {/* Delivery detail behind a disclosure, matching the stack review */}
        {planType === 'subscription' && subscriptionPlan.length > 0 && (
          <details className="mt-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] overflow-hidden group">
            <summary
              className="flex items-center justify-between px-5 py-3.5 cursor-pointer list-none text-xs font-bold"
              style={{ color: 'var(--color-text-2)', fontFamily: 'var(--font-display)' }}
            >
              Delivery details — what lands each month
              <Icon name="chevron-down" size={16} className="text-[var(--color-muted)] transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-3 pb-3">
              <SubscriptionProtocol
                plan={subscriptionPlan}
                slotTitleById={slotTitleById}
                minMonths={pricing.subscriptionMinMonths}
                monthlyTotal={pricing.subscriptionTotal}
                firstMonth={pricing.subscriptionFirstMonth}
                introPct={pricing.subscriptionIntroDiscountPct}
              />
            </div>
          </details>
        )}

        {/* Bundle disclaimer + standard supplements fine print */}
        <p className="text-[10px] leading-relaxed mt-4 text-center" style={{ color: 'var(--color-muted)' }}>
          {bundle.disclaimer}
        </p>
        <p className="text-[10px] leading-relaxed mt-2 text-center" style={{ color: 'var(--color-muted)' }}>
          Food supplements are not a substitute for a varied diet or medical care.
          Consult your GP before use if you are pregnant, breastfeeding, or taking
          prescribed medication (including HRT).
        </p>
      </div>

      {mounted && showStickyBar && createPortal(
        <div
          className="fixed inset-x-0 bottom-0 z-30 px-4 pt-6 pb-[max(0.9rem,env(safe-area-inset-bottom))] pointer-events-none"
          style={{ background: 'linear-gradient(to top, var(--color-bg) 55%, transparent)' }}
        >
          <div
            className="max-w-lg mx-auto flex items-center gap-3 rounded-2xl pl-4 pr-2 py-2 pointer-events-auto"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border-2)',
              boxShadow: '0 10px 34px -10px rgba(0,0,0,0.7)',
            }}
          >
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-display)' }}>
                {stickyIsSub ? 'Monthly' : 'One-off total'}
              </p>
              <p className="text-xl font-black leading-none" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
                {formatGBP(stickyTotal)}
                {stickyIsSub && <span className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>/mo</span>}
              </p>
            </div>
            <button
              onClick={handleCheckout}
              disabled={checkoutState.status === 'loading'}
              className="flex-1 py-3.5 rounded-xl text-sm font-bold tracking-wide active:scale-95 transition-all disabled:opacity-60 disabled:cursor-wait"
              style={{ background: 'var(--color-accent)', color: 'var(--color-bg)', fontFamily: 'var(--font-display)' }}
            >
              {checkoutState.status === 'loading'
                ? 'Building…'
                : stickyIsSub
                  ? 'Start subscription →'
                  : 'Checkout →'}
            </button>
          </div>
        </div>,
        document.body,
      )}

      {/* Already signed in: the account gate never ran, so this is where the
          terms and the health disclaimer get shown. */}
      {checkoutState.status === 'needs-consent' && (
        <ConsentGate
          versions={checkoutState.versions}
          notice={checkoutState.notice}
          subscription={checkoutState.payload.subscription}
          onAccept={resumeCheckout}
          onCancel={resetCheckout}
        />
      )}

      {checkoutState.status === 'needs-account' && (
        <AccountGate
          payload={checkoutState.payload}
          onAuthenticated={resumeCheckout}
          onCancel={resetCheckout}
        />
      )}
    </div>
  )
}
