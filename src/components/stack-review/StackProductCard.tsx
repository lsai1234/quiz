'use client'

import { useState } from 'react'
import type { StackSlotEntry } from '@/lib/stack-blueprint'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { PlanType } from '@/lib/store'
import { slotVisual } from '@/lib/catalogue/slot-visuals'
import { ProductTile } from './ProductTile'
import { ProductDetailSheet } from './ProductDetailSheet'

interface Props {
  slot: StackSlotEntry
  product: CatalogueProduct | undefined
  planType?: PlanType
  /** The monthly product this slot resolves to on subscription (may be the product itself). */
  subscriptionProduct?: CatalogueProduct
  onChangeProduct?: (slotId: string) => void
  onChangeVariant?: (slotId: string, variantId: string) => void
  onRemove?: (slotId: string) => void
}

export function StackProductCard({ slot, product, planType = 'oneoff', subscriptionProduct, onChangeProduct, onChangeVariant, onRemove }: Props) {
  // The card is slim by design: tile + name + one-line role + price. Tapping it
  // opens the full detail sheet, where the personalised reason, product facts,
  // flavour picker and swap/remove actions live — so the stack scans as a lineup
  // of products first and reads as detail only on demand.
  const [sheetOpen, setSheetOpen] = useState(false)

  const hue = slotVisual(slot.slotType).hue

  const inSubView = planType === 'subscription'
  const canSubscribe = !!(subscriptionProduct ?? product)?.subscriptionEligible
  const excludedFromPlan = inSubView && !canSubscribe

  const selectedVariant = product?.variants.find((v) => v.id === slot.selectedVariantId)
    ?? product?.variants.find((v) => v.available)
    ?? product?.variants[0]
  const price = selectedVariant?.price ?? product?.basePrice ?? 0
  const roleLine = slot.description || slot.title

  return (
    <>
      <div
        className="rounded-2xl overflow-hidden transition-opacity"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          opacity: excludedFromPlan ? 0.72 : 1,
        }}
      >
        <button
          onClick={() => setSheetOpen(true)}
          className="w-full flex items-center gap-3.5 p-3.5 text-left active:opacity-80 transition-opacity"
        >
          <ProductTile imageUrl={product?.imageUrl} slot={slot.slotType} title={product?.title} size={64} />

          <div className="flex-1 min-w-0">
            <span
              className="inline-block px-2 py-0.5 rounded-full text-[8px] font-bold tracking-widest uppercase mb-1"
              style={{
                color: hue,
                background: `color-mix(in srgb, ${hue} 12%, transparent)`,
                border: `1px solid color-mix(in srgb, ${hue} 24%, transparent)`,
                fontFamily: 'var(--font-display)',
              }}
            >
              {slot.title}
            </span>
            <p
              className="text-sm font-bold leading-snug truncate"
              style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}
            >
              {product?.title ?? 'Product unavailable'}
            </p>
            <p className="text-xs mt-0.5 leading-snug truncate" style={{ color: 'var(--color-muted)' }}>
              {roleLine}
            </p>
          </div>

          <div className="flex flex-col items-end gap-1.5 flex-shrink-0 self-stretch">
            <span
              className="text-base font-black"
              style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-display)' }}
            >
              £{price.toFixed(2)}
            </span>
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full mt-auto"
              style={{ color: 'var(--color-muted)', border: '1px solid var(--color-border-2)' }}
              aria-hidden
            >
              Details ›
            </span>
          </div>
        </button>
      </div>

      {sheetOpen && (
        <ProductDetailSheet
          slot={slot}
          product={product}
          planType={planType}
          subscriptionProduct={subscriptionProduct}
          onChangeVariant={onChangeVariant}
          onSwap={() => { setSheetOpen(false); onChangeProduct?.(slot.slotId) }}
          onRemove={() => { setSheetOpen(false); onRemove?.(slot.slotId) }}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  )
}
