'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from '@/components/ui/IconButton'
import type { StackSlotEntry } from '@/lib/stack-blueprint'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { productTypeLabel } from '@/lib/catalogue/product-type'
import { productImageSrc, productImageSrcSet } from '@/lib/images/product-image'
import { productDietary } from '@/lib/product-facts'
import { formatPerServing } from '@/lib/shop/per-serving'
import { cardFacts } from '@/lib/results/card-facts'

interface Props {
  slot: StackSlotEntry
  currentProduct: CatalogueProduct | undefined
  alternatives: CatalogueProduct[]
  onSelect: (slotId: string, productId: string) => void
  onClose: () => void
}

const ACCENT = '#00D4FF'

/**
 * A type label as it reads mid-sentence: "Change your vitamin C", not "your
 * Vitamin C" or "your vitamin c". Only a leading capital followed by a
 * lower-case letter drops, so "ZMA" and "B-complex" keep theirs.
 */
function inSentence(label: string): string {
  return label.replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase())
}

/**
 * The difference one pack makes to the order: "£3.00 more", "£2.00 less".
 * A pack price, not a monthly one; packs last different lengths, which is
 * what the per-serving figure beside it is for.
 */
export function priceDiff(current: number, candidate: number): { text: string; sign: -1 | 0 | 1 } {
  const diff = candidate - current
  if (Math.abs(diff) < 0.005) return { text: 'Same price', sign: 0 }
  const amount = `£${Math.abs(diff).toFixed(2)}`
  return diff > 0 ? { text: `${amount} more`, sign: 1 } : { text: `${amount} less`, sign: -1 }
}

/**
 * What can be said of an alternative without saying what it does: its diet
 * tags. No "Best value" (that one was our margin, not theirs) or "Premium".
 * "Vegetarian" says nothing "Vegan" hasn't.
 */
export function productTags(p: CatalogueProduct): string[] {
  const dietary = productDietary(p)
  return dietary.filter((d) => !(d === 'Vegetarian' && dietary.includes('Vegan'))).slice(0, 3)
}

export function ProductSwapModal({ slot, currentProduct, alternatives, onSelect, onClose }: Props) {
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

  // Both sides priced the way the card prices them: the current product at the
  // size on screen, an alternative at the size a swap would put there.
  const currentPrice = currentProduct ? cardFacts({ product: currentProduct, selectedVariantId: slot.selectedVariantId }).price : 0
  // The product type, not the slot title: "Immune Support" names a benefit.
  const typeLabel = productTypeLabel(currentProduct)

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
        style={{
          background: 'var(--color-surface)',
          maxHeight: '88dvh',
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-[var(--color-border-2)]" />
        </div>

        {/* Header */}
        <div className="px-5 pt-2 pb-4 flex items-start justify-between gap-3 flex-shrink-0 border-b border-[var(--color-border)]">
          <div>
            <p
              className="text-[10px] font-bold tracking-widest uppercase mb-0.5"
              style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}
            >
              {typeLabel}
            </p>
            <h3 className="text-lg font-black text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
              Change your {inSentence(typeLabel)}
            </h3>
            {currentProduct && (
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                Currently: {currentProduct.title}
              </p>
            )}
          </div>
          <IconButton icon="x" label="Close" size="sm" filled onClick={onClose} className="mt-0.5" />
        </div>

        {/* Scrollable product list */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {alternatives.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-[var(--color-muted)] text-sm">No alternative products found for this slot.</p>
              <p className="text-[var(--color-muted)] text-xs mt-1">The recommended product is already the best match.</p>
            </div>
          ) : (
            alternatives.map((alt) => {
              const isRecommended = alt.id === slot.recommendedProductId
              const isCurrent = alt.id === slot.selectedProductId
              const facts = cardFacts({ product: alt, selectedVariantId: isCurrent ? slot.selectedVariantId : null })
              const altPrice = facts.price
              const diff = priceDiff(currentPrice, altPrice)
              const tags = productTags(alt)
              const factLine = [
                productTypeLabel(alt),
                facts.servings != null ? `${Math.max(1, Math.round(facts.servings))} servings` : null,
                facts.perServing != null ? `${formatPerServing(facts.perServing)} per serving` : null,
              ].filter(Boolean).join(' · ')

              return (
                <button
                  key={alt.id}
                  onClick={() => onSelect(slot.slotId, alt.id)}
                  className={`w-full text-left rounded-2xl border p-4 active:scale-[0.98] transition-all ${
                    isCurrent
                      ? 'border-[var(--color-accent)]/50 bg-[var(--color-surface-2)]'
                      : 'border-[var(--color-border)] bg-[var(--color-surface-2)]'
                  }`}
                  style={isCurrent ? { boxShadow: `0 0 20px -8px ${ACCENT}` } : undefined}
                >
                  <div className="flex gap-3 items-start">
                    {/* Image */}
                    <div className="w-16 h-16 rounded-xl flex-shrink-0 overflow-hidden border border-[var(--color-border)] flex items-center justify-center" style={{ background: 'var(--color-surface)' }}>
                      {productImageSrc(alt.imageUrl, 64) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={productImageSrc(alt.imageUrl, 64)!}
                          srcSet={productImageSrcSet(alt.imageUrl, 64) ?? undefined}
                          alt={alt.title}
                          className="w-full h-full object-contain"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <span className="text-xl font-black opacity-40" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>
                          {productTypeLabel(alt).charAt(0)}
                        </span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-bold text-[var(--color-text)] leading-snug" style={{ fontFamily: 'var(--font-display)' }}>
                          {alt.title}
                        </p>
                        <p className="text-sm font-black flex-shrink-0" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>
                          £{altPrice.toFixed(2)}
                        </p>
                      </div>

                      {/* Facts only. The catalogue description says what a
                          product does, which is a health claim. */}
                      <p className="text-xs text-[var(--color-text-2)] mt-1 leading-relaxed" data-testid="swap-facts">
                        {factLine}
                      </p>

                      {/* Price diff + badges */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {!isCurrent && (
                          <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${
                            diff.sign === 0
                              ? 'text-[var(--color-muted)] border border-[var(--color-border)]'
                              : diff.sign > 0
                                ? 'text-[var(--color-red)] bg-[var(--color-red)]/8'
                                : 'text-emerald-400 bg-emerald-400/10'
                          }`}>
                            {diff.text}
                          </span>
                        )}
                        {isRecommended && (
                          <span
                            className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                            style={{ color: ACCENT, background: `color-mix(in srgb, ${ACCENT} 12%, transparent)` }}
                          >
                            Recommended for you
                          </span>
                        )}
                        {isCurrent && (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full text-[var(--color-muted)] border border-[var(--color-border)]">
                            Current
                          </span>
                        )}
                        {tags.map((tag) => (
                          <span key={tag} className="text-[9px] font-semibold px-2 py-0.5 rounded-full text-[var(--color-muted)] border border-[var(--color-border)]">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
