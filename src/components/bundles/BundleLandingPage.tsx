'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type { PrebuiltBundle, BundleAddOn } from '@/lib/bundles'
import type { StackBlueprint, StackSlotEntry } from '@/lib/stack-blueprint'
import { updateStackSlotVariant, removeOptionalSlot } from '@/lib/stack-blueprint/helpers'
import { calculatePricing, getSubscriptionProduct } from '@/lib/stack-blueprint/pricing'
import type { PlanType } from '@/lib/store'
import { useCatalogueProducts } from '@/hooks/useCatalogueProducts'
import { useStackCheckout } from '@/hooks/useStackCheckout'
import { StackProductCard } from '@/components/stack-review/StackProductCard'
import { StackPriceSummary } from '@/components/stack-review/StackPriceSummary'
import { StickyCheckoutBar } from '@/components/stack-review/StickyCheckoutBar'
import { CheckoutSuccess } from '@/components/stack-review/CheckoutSuccess'
import { BundleHero } from './BundleHero'
import { BundleAddOnCard } from './BundleAddOnCard'
import { WorkoutSection } from './WorkoutSection'
import { BundleHowTo } from './BundleHowTo'

interface Props {
  bundle: PrebuiltBundle
}

/**
 * Landing page for a prebuilt, creator-led bundle: the standard stack checkout
 * (product cards, flavour pickers, one-off vs subscription pricing) extended
 * with the content that sells it — the workout and the how-to-use routine.
 *
 * The stack is fixed data from the bundle definition, held in local state so
 * the quiz flow's store is untouched: visitors can pick flavours and toggle
 * the optional add-ons, but the core products can't be swapped or removed.
 */
export function BundleLandingPage({ bundle }: Props) {
  const { products } = useCatalogueProducts()
  const [rawBlueprint, setBlueprint] = useState<StackBlueprint>(bundle.blueprint)
  const [planType, setPlanType] = useState<PlanType>('oneoff')
  const stackRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const summaryRef = useRef<HTMLDivElement>(null)

  // Default any slot without a selected variant to the product's first
  // available variant so the picker and price always agree.
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

  const handleChangeVariant = useCallback(
    (slotId: string, variantId: string) => {
      setBlueprint((prev) => updateStackSlotVariant(prev, slotId, variantId))
    },
    [],
  )

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

  const { state: checkoutState, checkout, reset: resetCheckout } = useStackCheckout()
  const handleCheckout = useCallback(
    () => checkout(blueprint, products, planType),
    [checkout, blueprint, products, planType],
  )

  const sortedSlots = [...blueprint.slots].sort((a, b) => a.displayOrder - b.displayOrder)
  const pricing = calculatePricing(blueprint, products)
  const slotIds = new Set(blueprint.slots.map((s) => s.slotId))
  const addOns = bundle.addOns
    .map((addOn) => ({ addOn, product: products.find((p) => p.id === addOn.productId) }))
    .filter((a): a is { addOn: BundleAddOn; product: NonNullable<typeof a.product> } => !!a.product)

  if (checkoutState.status === 'success') {
    return (
      <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
        <CheckoutSuccess
          plan={checkoutState.plan}
          mock={checkoutState.mock}
          subscription={checkoutState.subscription}
          onBack={resetCheckout}
        />
      </div>
    )
  }

  return (
    <div ref={pageRef} className="min-h-screen pb-10" style={{ background: 'var(--color-bg)' }}>
      {/* Minimal brand header — first-time visitors land here cold */}
      <header
        className="sticky top-0 z-30 border-b border-[var(--color-border)]"
        style={{
          background: 'color-mix(in srgb, var(--color-bg) 88%, transparent)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <div className="max-w-lg mx-auto px-5 py-3.5 flex items-center justify-between">
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
            Build your own stack →
          </Link>
        </div>
      </header>

      <BundleHero bundle={bundle} productCount={sortedSlots.length} totalPrice={pricing.oneOffTotal} />

      <div className="h-px bg-[var(--color-border)] mx-5" />

      {/* What's inside */}
      <div ref={stackRef} className="px-5 pt-7 max-w-lg mx-auto space-y-3" style={{ scrollMarginTop: 16 }}>
        <p
          className="text-[10px] font-bold tracking-widest uppercase"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--color-muted)' }}
        >
          What&apos;s inside — {sortedSlots.length} products
        </p>
        <p className="text-xs leading-relaxed !mt-1 mb-4" style={{ color: 'var(--color-text-2)' }}>
          Pick your flavours — everything arrives together in one order.
        </p>
        {sortedSlots.map((slot) => {
          const product = products.find((p) => p.id === slot.selectedProductId)
          const subscriptionProduct = product ? getSubscriptionProduct(product, products) : undefined
          return (
            <StackProductCard
              key={slot.slotId}
              slot={slot}
              product={product}
              planType={planType}
              subscriptionProduct={subscriptionProduct}
              onChangeVariant={handleChangeVariant}
              onRemove={handleRemove}
            />
          )
        })}

        {/* Optional add-ons */}
        {addOns.map(({ addOn, product }) => (
          <BundleAddOnCard
            key={addOn.slotId}
            addOn={addOn}
            product={product}
            added={slotIds.has(addOn.slotId)}
            onAdd={handleAddAddOn}
          />
        ))}
      </div>

      {/* The gym routine that goes with the stack */}
      <WorkoutSection workout={bundle.workout} seriesName={bundle.seriesName} />

      <BundleHowTo steps={bundle.howToUse} />

      <div className="h-px bg-[var(--color-border)] mx-5 mt-8" />

      {/* Price summary + checkout */}
      <div ref={summaryRef} className="px-5 pt-6 max-w-lg mx-auto" style={{ scrollMarginTop: 64 }}>
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
        <StackPriceSummary
          pricing={pricing}
          planType={planType}
          onPlanChange={setPlanType}
          onCheckout={handleCheckout}
          onCustomise={() => stackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          customiseLabel="Back to products"
          isLoading={checkoutState.status === 'loading'}
        />

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

      <StickyCheckoutBar
        pricing={pricing}
        planType={planType}
        productCount={sortedSlots.length}
        isLoading={checkoutState.status === 'loading'}
        onCheckout={handleCheckout}
        sectionRef={pageRef}
        summaryRef={summaryRef}
      />
    </div>
  )
}
