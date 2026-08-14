'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { StackSlotEntry } from '@/lib/stack-blueprint'
import { formatGBP, PRICING_CONFIG } from '@/lib/stack-blueprint/pricing'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { PlanType } from '@/lib/store'
import { slotVisual } from '@/lib/catalogue/slot-visuals'
import { effectOnsetForProduct } from '@/lib/feedback'
import type { EffectOnset } from '@/lib/catalogue/types'
import { productFacts, productDietary } from '@/lib/product-facts'
import { QuizIcon } from '@/components/quiz/QuizIcon'
import { IconButton } from '@/components/ui/IconButton'
import { ProductTile } from './ProductTile'

interface Props {
  slot: StackSlotEntry
  product: CatalogueProduct | undefined
  planType: PlanType
  /** The monthly product this slot resolves to on subscription (may be the product itself). */
  subscriptionProduct?: CatalogueProduct
  onChangeVariant?: (slotId: string, variantId: string) => void
  /** Fired when the user taps "Swap product" — the card closes the sheet then opens the swap modal. */
  onSwap?: () => void
  /** Fired when the user taps "Remove". */
  onRemove?: () => void
  onClose: () => void
}

const ACCENT = '#00D4FF'

// Honest expectation-setting per product so nobody judges a slow-build product
// too early (or expects a quiet one to be "felt" at all).
const ONSET_EXPECTATION: Record<EffectOnset, string> = {
  immediate: "You'll feel this from the first day.",
  short: 'Give it 1–3 weeks to notice the difference.',
  long: 'Works quietly — expect to notice over 6–12 weeks.',
  none: "You won't feel it day to day — it's doing the work regardless.",
}

function variantLabel(v: { title: string; flavour: string | null; size: string | null }): string {
  const parts = [v.flavour, v.size].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : v.title
}

function Fact({ glyph, label, value, hue }: { glyph: string; label: string; value: string; hue: string }) {
  return (
    <div
      className="flex-1 min-w-0 rounded-xl p-3"
      style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
    >
      <span style={{ color: hue }}>
        <QuizIcon name={glyph} size={18} />
      </span>
      <p className="text-[9px] font-bold tracking-widest uppercase mt-2" style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-display)' }}>
        {label}
      </p>
      <p className="text-xs font-semibold mt-0.5 leading-snug" style={{ color: 'var(--color-text)' }}>
        {value}
      </p>
    </div>
  )
}

/**
 * The full-detail bottom sheet for a stack product. This is where everything
 * that no longer clutters the slim card lives — the personalised reason, the
 * key facts, dietary info, the flavour/size picker and the swap/remove actions
 * — laid out with room to breathe, on demand rather than inline.
 */
export function ProductDetailSheet({
  slot, product, planType, subscriptionProduct, onChangeVariant, onSwap, onRemove, onClose,
}: Props) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Lock scroll while open, restore on close
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const hue = slotVisual(slot.slotType).hue

  const subProduct = subscriptionProduct ?? product
  const canSubscribe = !!subProduct?.subscriptionEligible
  const flipsToRefill = !!product && !!subProduct && subProduct.id !== product.id && canSubscribe
  const subPrice = subProduct
    ? (subProduct.variants.find((v) => v.available)?.price ?? subProduct.basePrice) * (1 - PRICING_CONFIG.subscriptionDiscount)
    : 0
  const inSubView = planType === 'subscription'
  const selectedVariant = product?.variants.find((v) => v.id === slot.selectedVariantId)
    ?? product?.variants.find((v) => v.available)
    ?? product?.variants[0]
  const price = selectedVariant?.price ?? product?.basePrice ?? 0
  const showVariantPicker = product && product.variants.length > 1

  const dietary = product ? productDietary(product) : []
  const facts = product ? productFacts(product) : []

  if (!mounted) return null

  return createPortal(
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ background: 'rgba(0,0,0,0.72)' }}
    >
      {/* Bottom sheet */}
      <div
        className="w-full max-w-lg rounded-t-3xl overflow-hidden flex flex-col"
        style={{ background: 'var(--color-surface)', maxHeight: '90dvh' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-[var(--color-border-2)]" />
        </div>

        {/* Header — product hero */}
        <div className="px-5 pt-2 pb-4 flex items-start gap-4 flex-shrink-0 border-b border-[var(--color-border)]">
          <ProductTile imageUrl={product?.imageUrl} slot={slot.slotType} title={product?.title} size={92} />
          <div className="flex-1 min-w-0 pt-0.5">
            <span
              className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold tracking-widest uppercase mb-1.5"
              style={{
                color: hue,
                background: `color-mix(in srgb, ${hue} 12%, transparent)`,
                border: `1px solid color-mix(in srgb, ${hue} 24%, transparent)`,
                fontFamily: 'var(--font-display)',
              }}
            >
              {slot.title}
            </span>
            <h3 className="text-lg font-black leading-tight" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
              {product?.title ?? 'Product unavailable'}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-base font-black" style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-display)' }}>
                £{price.toFixed(2)}
              </span>
              {selectedVariant && (
                <span className="text-xs truncate" style={{ color: 'var(--color-muted)' }}>
                  {variantLabel(selectedVariant)}
                </span>
              )}
            </div>
          </div>
          <IconButton icon="x" label="Close" size="sm" filled onClick={onClose} />
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-5 space-y-6">
          {/* Why it's in your stack */}
          <section>
            <p className="text-[10px] font-bold tracking-widest uppercase mb-2" style={{ color: hue, fontFamily: 'var(--font-display)' }}>
              Why it&apos;s in your stack
            </p>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-2)' }}>
              {slot.reason}
            </p>
            {product && (
              <p className="text-xs leading-relaxed mt-2 flex items-start gap-1.5" style={{ color: 'var(--color-muted)' }}>
                <QuizIcon name="clock" size={13} className="mt-0.5 flex-shrink-0" />
                <span>{ONSET_EXPECTATION[effectOnsetForProduct(product)]}</span>
              </p>
            )}
            <div className="flex flex-wrap gap-1.5 mt-3">
              <span
                className="px-2 py-0.5 rounded-full text-[9px] font-semibold"
                style={{ border: '1px solid var(--color-border-2)', color: 'var(--color-muted)' }}
              >
                {slot.required ? 'Core to your stack' : 'Optional add-on'}
              </span>
              {inSubView ? (
                canSubscribe ? (
                  <span
                    className="px-2 py-0.5 rounded-full text-[9px] font-semibold"
                    style={{ color: ACCENT, background: `color-mix(in srgb, ${ACCENT} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${ACCENT} 20%, transparent)` }}
                  >
                    {flipsToRefill ? 'Monthly refill' : 'In monthly plan'}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold" style={{ border: '1px solid var(--color-border-2)', color: 'var(--color-muted)' }}>
                    One-off only
                  </span>
                )
              ) : (
                canSubscribe && (
                  <span
                    className="px-2 py-0.5 rounded-full text-[9px] font-semibold"
                    style={{ color: ACCENT, background: `color-mix(in srgb, ${ACCENT} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${ACCENT} 20%, transparent)` }}
                  >
                    Subscribe-ready
                  </span>
                )
              )}
            </div>
          </section>

          {/* The facts */}
          {facts.length > 0 && (
            <section>
              <p className="text-[10px] font-bold tracking-widest uppercase mb-2.5" style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-display)' }}>
                The facts
              </p>
              <div className="flex gap-2.5">
                {facts.map((f) => (
                  <Fact key={f.key} glyph={f.glyph} label={f.label} value={f.value} hue={hue} />
                ))}
              </div>
              {dietary.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {dietary.map((label) => (
                    <span
                      key={label}
                      className="px-2.5 py-1 rounded-full text-[10px] font-semibold"
                      style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border-2)', color: 'var(--color-text-2)' }}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Subscription resolution note */}
          {inSubView && flipsToRefill && (
            <div
              className="px-3.5 py-3 rounded-xl text-[12px] leading-snug"
              style={{ color: 'var(--color-text-2)', background: `color-mix(in srgb, ${ACCENT} 6%, transparent)`, border: `1px solid color-mix(in srgb, ${ACCENT} 18%, transparent)` }}
            >
              On subscription you&rsquo;ll get <span className="font-semibold">{subProduct?.title}</span>{' '}
              at <span className="font-semibold">{formatGBP(subPrice)}/mo</span> — a monthly-sized refill
              so it ships every month.
            </div>
          )}

          {/* Flavour & size picker */}
          {showVariantPicker && (
            <section>
              <p className="text-[10px] font-bold tracking-widest uppercase mb-2.5" style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-display)' }}>
                Flavour &amp; size
              </p>
              <div className="flex flex-col gap-1.5">
                {product!.variants.map((v) => {
                  const isSelected = (slot.selectedVariantId ?? selectedVariant?.id) === v.id
                  return (
                    <button
                      key={v.id}
                      onClick={() => { if (v.available) onChangeVariant?.(slot.slotId, v.id) }}
                      disabled={!v.available}
                      className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-left transition-all active:scale-[0.98]"
                      style={{
                        background: isSelected ? `color-mix(in srgb, ${ACCENT} 12%, transparent)` : 'var(--color-surface-2)',
                        border: isSelected ? `1px solid color-mix(in srgb, ${ACCENT} 35%, transparent)` : '1px solid var(--color-border)',
                        opacity: v.available ? 1 : 0.4,
                        cursor: v.available ? 'pointer' : 'not-allowed',
                      }}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-3.5 h-3.5 rounded-full flex-shrink-0 flex items-center justify-center"
                          style={{ background: isSelected ? ACCENT : 'transparent', border: isSelected ? 'none' : '1.5px solid var(--color-border-2)' }}
                        >
                          {isSelected && (
                            <svg width="7" height="6" viewBox="0 0 8 6" fill="none">
                              <path d="M1 3L3 5L7 1" stroke="#0A0A0A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                        <span className="text-sm font-medium" style={{ color: isSelected ? 'var(--color-text)' : 'var(--color-text-2)' }}>
                          {variantLabel(v)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {!v.available && <span className="text-[9px]" style={{ color: 'var(--color-muted)' }}>Sold out</span>}
                        <span className="text-sm font-bold" style={{ color: isSelected ? ACCENT : 'var(--color-muted)' }}>
                          £{v.price.toFixed(2)}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          {/* Warnings — fine print */}
          {product && product.warnings.length > 0 && (
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--color-muted)' }}>
              {product.warnings.join(' · ')}
            </p>
          )}
        </div>

        {/* Sticky footer actions */}
        {(slot.canSwap || slot.canRemove) && (
          <div
            className="flex gap-2.5 px-5 py-3.5 flex-shrink-0 pb-[max(0.9rem,env(safe-area-inset-bottom))]"
            style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
          >
            {slot.canSwap && (
              <button
                onClick={onSwap}
                className="flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-95"
                style={{ border: '1px solid var(--color-border-2)', color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}
              >
                Swap product
              </button>
            )}
            {slot.canRemove && (
              <button
                onClick={onRemove}
                className="py-3 px-5 rounded-xl text-sm font-semibold transition-all active:scale-95"
                style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-display)' }}
              >
                Remove
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
