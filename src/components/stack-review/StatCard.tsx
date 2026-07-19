'use client'

import { useEffect, useState } from 'react'
import type { StackSlotEntry } from '@/lib/stack-blueprint'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { PlanType } from '@/lib/store'
import { productStatScore, MAX_STAT, type StatAxis } from '@/lib/stack-stats'
import { slotVisual } from '@/lib/catalogue/slot-visuals'
import { ProductTile } from './ProductTile'
import { ProductDetailSheet } from './ProductDetailSheet'

interface Props {
  slot: StackSlotEntry
  product: CatalogueProduct | undefined
  planType: PlanType
  subscriptionProduct?: CatalogueProduct
  /** Shared axes — the same for every card so the deck reads as top-trumps. */
  axes: StatAxis[]
  /** Play the bar-fill animation (deck deals this card into view). */
  animate?: boolean
  onChangeProduct?: (slotId: string) => void
  onChangeVariant?: (slotId: string, variantId: string) => void
  onRemove?: (slotId: string) => void
}

const ACCENT = '#00D4FF'

/**
 * A top-trumps card for one stack product: the product up top, then a bar per
 * shared stat axis. Bars on the goals this product targets light up (its
 * "boost"); the rest sit as faint context. Tapping the card opens the full
 * detail sheet, where swap / flavour / remove live.
 */
export function StatCard({ slot, product, planType, subscriptionProduct, axes, animate = true, onChangeProduct, onChangeVariant, onRemove }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false)
  // Bars fill from empty once mounted (or render full immediately when not animating).
  const [filled, setFilled] = useState(!animate)
  const hue = slotVisual(slot.slotType).hue

  useEffect(() => {
    if (!animate) { setFilled(true); return }
    const id = requestAnimationFrame(() => setFilled(true))
    return () => cancelAnimationFrame(id)
  }, [animate])

  const selectedVariant = product?.variants.find((v) => v.id === slot.selectedVariantId)
    ?? product?.variants.find((v) => v.available)
    ?? product?.variants[0]
  const price = selectedVariant?.price ?? product?.basePrice ?? 0
  const roleLine = slot.description || slot.title

  const bars = product
    ? axes.map((a) => ({
        ...a,
        score: productStatScore(product, a.goal),
        targeted: product.goals.includes(a.goal),
      }))
    : []

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
              {slot.title}
            </span>
            <p className="text-sm font-bold leading-snug line-clamp-2" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
              {product?.title ?? 'Product unavailable'}
            </p>
          </div>
        </div>

        <div className="px-4">
          <div className="flex items-baseline justify-between">
            <p className="text-xs leading-snug line-clamp-1 flex-1 min-w-0 pr-2" style={{ color: 'var(--color-muted)' }}>
              {roleLine}
            </p>
            <span className="text-base font-black flex-shrink-0" style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-display)' }}>
              £{price.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Stat bars */}
        <div className="px-4 pt-3.5 pb-3 mt-2 flex-1 flex flex-col gap-2" style={{ borderTop: '1px solid var(--color-border)' }}>
          <p className="text-[9px] font-bold tracking-widest uppercase mb-0.5" style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-display)' }}>
            What it supports
          </p>
          {bars.map((b) => (
            <div key={b.goal} className="flex items-center gap-2.5">
              <span
                className="text-[10px] font-semibold w-[68px] flex-shrink-0 truncate"
                style={{ color: b.targeted ? 'var(--color-text)' : 'var(--color-muted)' }}
              >
                {b.label}
              </span>
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-2)' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: filled ? `${(b.score / MAX_STAT) * 100}%` : '0%',
                    background: b.targeted
                      ? `linear-gradient(to right, color-mix(in srgb, ${ACCENT} 55%, transparent), ${ACCENT})`
                      : 'var(--color-border-2)',
                    boxShadow: b.targeted ? `0 0 8px -1px color-mix(in srgb, ${ACCENT} 60%, transparent)` : 'none',
                    transition: animate ? 'width 0.7s cubic-bezier(0.22,1,0.36,1)' : 'none',
                  }}
                />
              </div>
              {b.targeted && (
                <span className="text-[9px] font-black flex-shrink-0" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>
                  ✦
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Footer affordance */}
        <div className="px-4 py-2.5" style={{ borderTop: '1px solid var(--color-border)' }}>
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
