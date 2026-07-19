'use client'

import { useState } from 'react'
import type { StackSlotEntry } from '@/lib/stack-blueprint'
import { formatGBP, PRICING_CONFIG } from '@/lib/stack-blueprint/pricing'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { PlanType } from '@/lib/store'
import { slotVisual } from '@/lib/catalogue/slot-visuals'
import { ProductTile } from './ProductTile'

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

const ACCENT = '#00D4FF'

function variantLabel(v: { title: string; flavour: string | null; size: string | null }): string {
  const parts = [v.flavour, v.size].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : v.title
}

export function StackProductCard({ slot, product, planType = 'oneoff', subscriptionProduct, onChangeProduct, onChangeVariant, onRemove }: Props) {
  // The card is slim by default: tile + name + one-line role + price. Everything
  // else — the personalised reason, tags, subscription note, flavour picker and
  // swap/remove actions — lives behind this tap so the stack scans as a lineup
  // of products first, and reads as detail only on demand.
  const [expanded, setExpanded] = useState(false)
  const [variantsOpen, setVariantsOpen] = useState(false)

  const hue = slotVisual(slot.slotType).hue

  // On subscription, every slot resolves to a monthly product (often itself).
  const subProduct = subscriptionProduct ?? product
  const canSubscribe = !!subProduct?.subscriptionEligible
  const flipsToRefill = !!product && !!subProduct && subProduct.id !== product.id && canSubscribe
  const subPrice = subProduct
    ? (subProduct.variants.find((v) => v.available)?.price ?? subProduct.basePrice) * (1 - PRICING_CONFIG.subscriptionDiscount)
    : 0
  const inSubView = planType === 'subscription'
  // Only dim when a slot genuinely can't be subscribed at all.
  const excludedFromPlan = inSubView && !canSubscribe
  const selectedVariant = product?.variants.find((v) => v.id === slot.selectedVariantId)
    ?? product?.variants.find((v) => v.available)
    ?? product?.variants[0]
  const price = selectedVariant?.price ?? product?.basePrice ?? 0

  const showVariantPicker = product && product.variants.length > 1
  const roleLine = slot.description || slot.title

  return (
    <div
      className="rounded-2xl overflow-hidden transition-opacity"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        opacity: excludedFromPlan ? 0.72 : 1,
      }}
    >
      {/* Collapsed header — the whole row toggles the detail drawer */}
      <button
        onClick={() => setExpanded((o) => !o)}
        aria-expanded={expanded}
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
            style={{
              color: 'var(--color-muted)',
              border: '1px solid var(--color-border-2)',
              display: 'inline-block',
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s ease',
            }}
          >
            ▾
          </span>
        </div>
      </button>

      {/* Detail drawer — reason, tags, subscription note, flavour picker, actions */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--color-border)' }}>
          <div className="p-4 pt-3.5">
            {selectedVariant && (
              <p className="text-xs mb-2" style={{ color: 'var(--color-muted)' }}>
                {variantLabel(selectedVariant)}
              </p>
            )}

            {/* Why this product is in the stack — the personalised reason, given
                room to breathe now that it's on demand rather than inline. */}
            <p className="text-[10px] font-bold tracking-widest uppercase mb-1" style={{ color: hue, fontFamily: 'var(--font-display)' }}>
              Why this?
            </p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-2)' }}>
              {slot.reason}
            </p>

            {/* Tags row */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              <span
                className="px-2 py-0.5 rounded-full text-[9px] font-semibold"
                style={{ border: '1px solid var(--color-border-2)', color: 'var(--color-muted)' }}
              >
                {slot.required ? 'Core' : 'Optional'}
              </span>
              {inSubView ? (
                !canSubscribe ? (
                  <span
                    className="px-2 py-0.5 rounded-full text-[9px] font-semibold"
                    style={{ border: '1px solid var(--color-border-2)', color: 'var(--color-muted)' }}
                  >
                    One-off only
                  </span>
                ) : (
                  <span
                    className="px-2 py-0.5 rounded-full text-[9px] font-semibold"
                    style={{
                      color: ACCENT,
                      background: `color-mix(in srgb, ${ACCENT} 8%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${ACCENT} 20%, transparent)`,
                    }}
                  >
                    {flipsToRefill ? 'Monthly refill' : 'In monthly plan'}
                  </span>
                )
              ) : (
                canSubscribe && (
                  <span
                    className="px-2 py-0.5 rounded-full text-[9px] font-semibold"
                    style={{
                      color: ACCENT,
                      background: `color-mix(in srgb, ${ACCENT} 8%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${ACCENT} 20%, transparent)`,
                    }}
                  >
                    Subscribe-ready
                  </span>
                )
              )}
            </div>

            {/* Subscription resolution note — when this slot flips to a monthly refill */}
            {inSubView && flipsToRefill && (
              <div
                className="mt-3 px-3 py-2 rounded-xl text-[11px] leading-snug"
                style={{
                  color: 'var(--color-text-2)',
                  background: `color-mix(in srgb, ${ACCENT} 6%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${ACCENT} 18%, transparent)`,
                }}
              >
                On subscription you’ll get <span className="font-semibold">{subProduct?.title}</span>{' '}
                at <span className="font-semibold">{formatGBP(subPrice)}/mo</span> — a monthly-sized refill
                so it ships every month.
              </div>
            )}
          </div>

          {/* Flavour / size picker — collapsed by default, expand on tap */}
          {showVariantPicker && (
            <div style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-surface-2)' }}>
              {/* Collapsed summary row — always visible */}
              <button
                onClick={() => setVariantsOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-3 text-left active:opacity-75 transition-opacity"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="text-[9px] font-bold tracking-widest uppercase flex-shrink-0"
                    style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-display)' }}
                  >
                    Flavour
                  </span>
                  <span className="text-xs font-medium truncate" style={{ color: 'var(--color-text-2)' }}>
                    {selectedVariant ? variantLabel(selectedVariant) : '—'}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs font-bold" style={{ color: ACCENT }}>
                    {selectedVariant ? `£${selectedVariant.price.toFixed(2)}` : ''}
                  </span>
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{
                      color: 'var(--color-muted)',
                      border: '1px solid var(--color-border-2)',
                      display: 'inline-block',
                      transform: variantsOpen ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.2s ease',
                    }}
                  >
                    ▾
                  </span>
                </div>
              </button>

              {/* Expanded variant list */}
              {variantsOpen && (
                <div className="px-3 pb-3 flex flex-col gap-1.5">
                  {product!.variants.map((v) => {
                    const isSelected = (slot.selectedVariantId ?? selectedVariant?.id) === v.id
                    return (
                      <button
                        key={v.id}
                        onClick={() => {
                          if (v.available) {
                            onChangeVariant?.(slot.slotId, v.id)
                            setVariantsOpen(false)
                          }
                        }}
                        disabled={!v.available}
                        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all active:scale-[0.98]"
                        style={{
                          background: isSelected ? `color-mix(in srgb, ${ACCENT} 12%, transparent)` : 'transparent',
                          border: isSelected ? `1px solid color-mix(in srgb, ${ACCENT} 35%, transparent)` : '1px solid var(--color-border)',
                          opacity: v.available ? 1 : 0.4,
                          cursor: v.available ? 'pointer' : 'not-allowed',
                        }}
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-3.5 h-3.5 rounded-full flex-shrink-0 flex items-center justify-center"
                            style={{
                              background: isSelected ? ACCENT : 'transparent',
                              border: isSelected ? 'none' : '1.5px solid var(--color-border-2)',
                            }}
                          >
                            {isSelected && (
                              <svg width="7" height="6" viewBox="0 0 8 6" fill="none">
                                <path d="M1 3L3 5L7 1" stroke="#0A0A0A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                          <span className="text-xs font-medium" style={{ color: isSelected ? 'var(--color-text)' : 'var(--color-text-2)' }}>
                            {variantLabel(v)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {!v.available && <span className="text-[9px]" style={{ color: 'var(--color-muted)' }}>Sold out</span>}
                          <span className="text-xs font-bold" style={{ color: isSelected ? ACCENT : 'var(--color-muted)' }}>
                            £{v.price.toFixed(2)}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          {(slot.canSwap || slot.canRemove) && (
            <div
              className="flex gap-2 px-4 py-3"
              style={{ borderTop: '1px solid var(--color-border)' }}
            >
              {slot.canSwap && (
                <button
                  onClick={() => onChangeProduct?.(slot.slotId)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95"
                  style={{
                    border: '1px solid var(--color-border-2)',
                    color: 'var(--color-text-2)',
                    fontFamily: 'var(--font-display)',
                  }}
                >
                  Swap product
                </button>
              )}
              {slot.canRemove && (
                <button
                  onClick={() => onRemove?.(slot.slotId)}
                  className="py-2.5 px-3 rounded-xl text-xs font-semibold transition-all active:scale-95"
                  style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-display)' }}
                >
                  Remove
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
