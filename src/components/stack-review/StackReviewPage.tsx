'use client'

import { useCallback, useMemo, useState } from 'react'
import { useQuizStore } from '@/lib/store'
import { MOCK_BLUEPRINT } from '@/lib/stack-blueprint'
import {
  updateStackSlotVariant,
  updateStackSlotProduct,
  getSwappableProductsForSlot,
  addBoosterSlot,
  removeOptionalSlot,
} from '@/lib/stack-blueprint/helpers'
import { calculatePricing } from '@/lib/stack-blueprint/pricing'
import type { StackSlotEntry } from '@/lib/stack-blueprint'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { SLOT_LABELS } from '@/lib/catalogue/types'
import { useCatalogueProducts } from '@/hooks/useCatalogueProducts'
import { useStackCheckout } from '@/hooks/useStackCheckout'
import { StackHero } from './StackHero'
import { StackProductCard } from './StackProductCard'
import { StackPriceSummary } from './StackPriceSummary'
import { ProductSwapModal } from './ProductSwapModal'
import { StackBoosters } from './StackBoosters'

export function StackReviewPage() {
  const { stackBlueprint, setStackBlueprint, planType, setPlanType } = useQuizStore()
  // MOCK_BLUEPRINT only when no blueprint exists at all (direct navigation).
  // The factory guarantees at least one slot, so a real blueprint — however
  // small — is always shown as-is rather than replaced with the mock stack.
  const rawBlueprint = stackBlueprint ?? MOCK_BLUEPRINT
  // useCatalogueProducts triggers the /api/catalogue fetch (once per session)
  // and returns the properly-typed CatalogueProduct[] from the Zustand store.
  const { products } = useCatalogueProducts()

  // Default any slot without a selected variant to the product's first available
  // variant so the selector and price always agree.
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

  // Swap modal state
  const [swapSlot, setSwapSlot] = useState<StackSlotEntry | null>(null)

  const handleChangeVariant = useCallback(
    (slotId: string, variantId: string) => {
      setStackBlueprint(updateStackSlotVariant(blueprint, slotId, variantId))
    },
    [blueprint, setStackBlueprint],
  )

  const handleOpenSwap = useCallback(
    (slotId: string) => {
      const slot = blueprint.slots.find((s) => s.slotId === slotId) ?? null
      setSwapSlot(slot)
    },
    [blueprint],
  )

  const handleSelectSwap = useCallback(
    (slotId: string, newProductId: string) => {
      const product = products.find((p) => p.id === newProductId)
      const defaultVariant = product?.variants.find((v) => v.available)
      let updated = updateStackSlotProduct(blueprint, slotId, newProductId)
      if (defaultVariant) updated = updateStackSlotVariant(updated, slotId, defaultVariant.id)
      setStackBlueprint(updated)
      setSwapSlot(null)
    },
    [blueprint, products, setStackBlueprint],
  )

  const handleRemove = useCallback(
    (slotId: string) => {
      try {
        setStackBlueprint(removeOptionalSlot(blueprint, slotId))
      } catch {
        // required slot — silently ignore (button shouldn't appear for these)
      }
    },
    [blueprint, setStackBlueprint],
  )

  const handleAddBooster = useCallback(
    (product: CatalogueProduct) => {
      const firstVariant = product.variants.find((v) => v.available) ?? product.variants[0]
      const slotType = product.stackSlots[0]
      const slotId = `booster-${product.id}`
      const updated = addBoosterSlot(blueprint, {
        slotId,
        slotType,
        title: SLOT_LABELS[slotType] ?? product.category,
        description: product.shortReason || product.description,
        recommendedProductId: product.id,
        selectedProductId: product.id,
        selectedVariantId: firstVariant?.id ?? null,
        required: false,
        canSwap: true,
        swapGroup: product.swapGroup,
        reason: product.shortReason || product.description,
        confidenceScore: product.recommendationPriority * 10,
      })
      setStackBlueprint(updated)
    },
    [blueprint, setStackBlueprint],
  )

  const { state: checkoutState, checkout, reset: resetCheckout } = useStackCheckout()

  const handleCheckout = useCallback(
    () => checkout(blueprint, products),
    [checkout, blueprint, products],
  )

  const sortedSlots = [...blueprint.slots].sort((a, b) => a.displayOrder - b.displayOrder)
  const pricing = calculatePricing(blueprint, products)

  // IDs already in the stack (core + added boosters)
  const stackProductIds = new Set(blueprint.slots.map((s) => s.selectedProductId))

  // Booster candidates: isBoosterEligible, not already in stack, ordered by
  // goal overlap with blueprint then recommendationPriority
  const primaryGoal = blueprint.primaryGoal
  const allGoals = [primaryGoal, ...blueprint.secondaryGoals]
  const boosters = useMemo(() => {
    const seenSlots = new Set<string>()
    return products
      .filter((p) => p.isBoosterEligible && !stackProductIds.has(p.id))
      .sort((a, b) => {
        const aGoalHits = a.goals.filter((g) => allGoals.includes(g)).length
        const bGoalHits = b.goals.filter((g) => allGoals.includes(g)).length
        if (bGoalHits !== aGoalHits) return bGoalHits - aGoalHits
        return b.recommendationPriority - a.recommendationPriority
      })
      .filter((p) => {
        const slot = p.stackSlots[0]
        if (!slot || seenSlots.has(slot)) return false
        seenSlots.add(slot)
        return true
      })
      .slice(0, 4)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, blueprint.slots, primaryGoal, blueprint.secondaryGoals])

  // Build alternatives list for the open swap modal slot
  const swapCurrentProduct = swapSlot ? products.find((p) => p.id === swapSlot.selectedProductId) : undefined
  const swapAlternatives = swapSlot
    ? [
        ...products.filter((p) => p.id === swapSlot.selectedProductId),
        ...getSwappableProductsForSlot(swapSlot, products),
      ].filter((p, idx, arr) => arr.findIndex((x) => x.id === p.id) === idx)
    : []

  if (!blueprint) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-[var(--color-muted)] text-sm">Building your stack…</p>
      </div>
    )
  }

  return (
    <>
      <div className="pb-10">
        <StackHero
          blueprint={blueprint}
          productCount={sortedSlots.length}
          totalPrice={pricing.oneOffTotal}
        />

        <div className="h-px bg-[var(--color-border)] mx-5" />

        {/* Core + added booster product cards */}
        <div className="px-5 pt-7 max-w-lg mx-auto space-y-3">
          <p
            className="text-[10px] font-bold tracking-widest uppercase text-[var(--color-muted)] mb-4"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Your personalised stack — {sortedSlots.length} products
          </p>
          {sortedSlots.map((slot) => {
            const product = products.find((p) => p.id === slot.selectedProductId)
            return (
              <StackProductCard
                key={slot.slotId}
                slot={slot}
                product={product}
                planType={planType}
                onChangeProduct={handleOpenSwap}
                onChangeVariant={handleChangeVariant}
                onRemove={handleRemove}
              />
            )
          })}
        </div>

        {/* Optional booster suggestions — only show products not yet in stack */}
        <StackBoosters
          boosters={boosters}
          addedIds={stackProductIds}
          onAdd={handleAddBooster}
        />

        {/* Divider before pricing */}
        <div className="h-px bg-[var(--color-border)] mx-5 mt-8" />

        {/* Price summary + checkout */}
        <div className="px-5 pt-6 max-w-lg mx-auto">
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
            isLoading={checkoutState.status === 'loading'}
          />

          {/* Safety fine print */}
          <p className="text-[10px] leading-relaxed mt-4 text-center" style={{ color: 'var(--color-muted)' }}>
            Food supplements are not a substitute for a varied diet or medical care.
            Consult your GP before use if you are pregnant, breastfeeding, or taking
            prescribed medication (including HRT).
          </p>
        </div>
      </div>

      {swapSlot && (
        <ProductSwapModal
          slot={swapSlot}
          currentProduct={swapCurrentProduct}
          alternatives={swapAlternatives}
          onSelect={handleSelectSwap}
          onClose={() => setSwapSlot(null)}
        />
      )}
    </>
  )
}
