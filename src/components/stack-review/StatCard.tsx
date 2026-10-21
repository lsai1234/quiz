'use client'

import { useState } from 'react'
import type { StackSlotEntry } from '@/lib/stack-blueprint'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { PlanType } from '@/lib/store'
import { slotVisual } from '@/lib/catalogue/slot-visuals'
import { productTypeLabel } from '@/lib/catalogue/product-type'
import { ProductTile } from './ProductTile'
import { ProductDetailSheet } from './ProductDetailSheet'

interface Props {
  slot: StackSlotEntry
  product: CatalogueProduct | undefined
  planType: PlanType
  subscriptionProduct?: CatalogueProduct
  onChangeProduct?: (slotId: string) => void
  onChangeVariant?: (slotId: string, variantId: string) => void
  onRemove?: (slotId: string) => void
}

/**
 * The card for one stack product: its type, name, role line and price.
 * Tapping the card opens the full detail sheet, where swap / flavour / remove
 * live.
 *
 * The tag is the product type ("Vitamin C"), not the slot title ("Immune
 * Support"): a goal printed under a product's name is a health claim. The
 * "What it supports" bars were removed in Phase 1 for the same reason.
 */
export function StatCard({ slot, product, planType, subscriptionProduct, onChangeProduct, onChangeVariant, onRemove }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const hue = slotVisual(slot.slotType).hue

  const selectedVariant = product?.variants.find((v) => v.id === slot.selectedVariantId)
    ?? product?.variants.find((v) => v.available)
    ?? product?.variants[0]
  const price = selectedVariant?.price ?? product?.basePrice ?? 0
  // No fallback to `slot.title`: that is the benefit label the tag replaced.
  const roleLine = slot.description

  return (
    <>
      <button
        onClick={() => setSheetOpen(true)}
        className="flex flex-col text-left rounded-2xl overflow-hidden h-full active:scale-[0.98] transition-transform"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        {/* Product header */}
        <div className="p-4 pb-3 flex items-center gap-3">
          <ProductTile imageUrl={product?.imageUrl} slot={slot.slotType} title={product?.title} size={56} />
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
              {productTypeLabel(product)}
            </span>
            <p className="text-sm font-bold leading-snug line-clamp-2" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
              {product?.title ?? 'Product unavailable'}
            </p>
          </div>
        </div>

        <div className="px-4 pb-3">
          <div className="flex items-baseline justify-between">
            <p className="text-xs leading-snug line-clamp-1 flex-1 min-w-0 pr-2" style={{ color: 'var(--color-muted)' }}>
              {roleLine}
            </p>
            <span className="text-base font-black flex-shrink-0" style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-display)' }}>
              £{price.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Footer affordance — pinned to the bottom so every card in the deck
            ends on the same line. */}
        <div className="px-4 py-2.5 mt-auto" style={{ borderTop: '1px solid var(--color-border)' }}>
          <span className="text-[10px] font-bold tracking-wide" style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-display)' }}>
            Tap for details ›
          </span>
        </div>
      </button>

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
