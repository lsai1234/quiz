'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from '@/components/ui/IconButton'
import type { StackSlotEntry } from '@/lib/stack-blueprint'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { productImageSrc, productImageSrcSet } from '@/lib/images/product-image'

interface Props {
  slot: StackSlotEntry
  currentProduct: CatalogueProduct | undefined
  alternatives: CatalogueProduct[]
  onSelect: (slotId: string, productId: string) => void
  onClose: () => void
}

const ACCENT = '#00D4FF'

function priceDiff(current: number, candidate: number): string {
  const diff = candidate - current
  if (Math.abs(diff) < 0.01) return 'No price change'
  const sign = diff > 0 ? '+' : '−'
  return `${sign}£${Math.abs(diff).toFixed(2)}/month`
}

function productTags(p: CatalogueProduct): string[] {
  const tags: string[] = []
  if (p.dietaryTags.includes('vegan')) tags.push('Vegan')
  if (p.dietaryTags.includes('dairy-free')) tags.push('Dairy-free')
  if (p.dietaryTags.includes('gluten-free')) tags.push('Gluten-free')
  if (p.marginPriority >= 8) tags.push('Best value')
  if (p.recommendationPriority >= 9) tags.push('Premium')
  if (p.basePrice < 30) tags.push('Light option')
  return tags.slice(0, 3)
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

  const currentPrice = currentProduct?.basePrice ?? 0

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
              {slot.title}
            </p>
            <h3 className="text-lg font-black text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
              Change your {slot.title.toLowerCase()}
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
              const firstVariant = alt.variants.find((v) => v.available) ?? alt.variants[0]
              const altPrice = firstVariant?.price ?? alt.basePrice
              const diff = priceDiff(currentPrice, altPrice)
              const tags = productTags(alt)

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
                    <div className="w-16 h-16 rounded-xl flex-shrink-0 overflow-hidden bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center">
                      {productImageSrc(alt.imageUrl, 64) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={productImageSrc(alt.imageUrl, 64)!}
                          srcSet={productImageSrcSet(alt.imageUrl, 64) ?? undefined}
                          alt={alt.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <span className="text-xl font-black opacity-40" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>
                          {slot.title.charAt(0)}
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

                      <p className="text-xs text-[var(--color-text-2)] mt-1 leading-relaxed line-clamp-2">
                        {alt.description}
                      </p>

                      {/* Price diff + badges */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${
                          diff === 'No price change'
                            ? 'text-[var(--color-muted)] border border-[var(--color-border)]'
                            : diff.startsWith('+')
                              ? 'text-[var(--color-red)] bg-[var(--color-red)]/8'
                              : 'text-emerald-400 bg-emerald-400/10'
                        }`}>
                          {diff}
                        </span>
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
