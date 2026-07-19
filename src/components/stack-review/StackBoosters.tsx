'use client'

import { useEffect, useRef, useState } from 'react'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { ProductTile } from './ProductTile'

interface Props {
  boosters: CatalogueProduct[]
  addedIds: Set<string>
  onAdd: (product: CatalogueProduct) => void
}

const ACCENT = '#00D4FF'

const BOOSTER_COPY: Record<string, string> = {
  recovery: 'Add recovery support',
  health: 'Add daily health support',
  sleep: 'Add sleep support',
  hydration: 'Add hydration support',
  'vegan-support': 'Add vegan-friendly nutrition',
}

function boosterHeadline(product: CatalogueProduct): string {
  const slot = product.stackSlots[0]
  return BOOSTER_COPY[slot] ?? 'Recommended upgrade'
}

function boosterTags(product: CatalogueProduct): string[] {
  const tags: string[] = []
  if (product.dietaryTags.includes('vegan')) tags.push('Vegan')
  if (product.dietaryTags.includes('dairy-free')) tags.push('Dairy-free')
  if (product.dietaryTags.includes('gluten-free')) tags.push('Gluten-free')
  if (product.marginPriority >= 8) tags.push('Best value')
  if (product.recommendationPriority >= 8) tags.push('Popular')
  return tags.slice(0, 3)
}

export function StackBoosters({ boosters, addedIds, onAdd }: Props) {
  // Brief pop on the just-added card — confirmation the tap landed.
  const [justAdded, setJustAdded] = useState<string | null>(null)
  const [reduced, setReduced] = useState(false)
  const popTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    return () => { if (popTimer.current) clearTimeout(popTimer.current) }
  }, [])

  const handleAdd = (product: CatalogueProduct) => {
    onAdd(product)
    if (reduced) return
    setJustAdded(product.id)
    if (popTimer.current) clearTimeout(popTimer.current)
    popTimer.current = setTimeout(() => setJustAdded(null), 420)
  }

  if (boosters.length === 0) return null

  return (
    <div className="pt-8">
      {/* Section header */}
      <div className="px-5 max-w-lg mx-auto mb-4">
        <p
          className="text-[10px] font-bold tracking-widest uppercase text-[var(--color-muted)] mb-1"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Optional add-ons
        </p>
        <h3
          className="text-xl font-black text-[var(--color-text)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Complete your stack
        </h3>
        <p className="text-xs text-[var(--color-text-2)] mt-1">
          Swipe to explore — add anything that fits your goals.
        </p>
      </div>

      {/* Horizontal swipe carousel */}
      <div
        className="flex gap-3 overflow-x-auto px-5 pb-3"
        style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
      >
        {boosters.map((product) => {
          const isAdded = addedIds.has(product.id)
          const firstVariant = product.variants.find((v) => v.available) ?? product.variants[0]
          const price = firstVariant?.price ?? product.basePrice
          const tags = boosterTags(product)

          return (
            <div
              key={product.id}
              className="flex-shrink-0 w-60 rounded-2xl overflow-hidden transition-all"
              style={{
                scrollSnapAlign: 'start',
                border: isAdded
                  ? `1px solid color-mix(in srgb, ${ACCENT} 40%, transparent)`
                  : '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                transform: justAdded === product.id ? 'scale(1.04)' : 'scale(1)',
                ...(isAdded ? { boxShadow: `0 0 20px -8px ${ACCENT}` } : {}),
              }}
            >
              <div className="p-4">
                {/* Eyebrow */}
                <p
                  className="text-[9px] font-bold tracking-widest uppercase mb-2"
                  style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}
                >
                  {boosterHeadline(product)}
                </p>

                <div className="flex gap-3 items-start">
                  {/* Image — F1 tile, so image-less boosters get a slot-hued glyph */}
                  <ProductTile
                    imageUrl={product.imageUrl}
                    slot={product.stackSlots[0]}
                    title={product.title}
                    size={64}
                  />

                  {/* Info + CTA */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className="text-sm font-bold text-[var(--color-text)] leading-snug line-clamp-2"
                        style={{ fontFamily: 'var(--font-display)' }}
                      >
                        {product.title}
                      </p>
                      <p
                        className="text-sm font-black flex-shrink-0"
                        style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}
                      >
                        £{price.toFixed(2)}
                      </p>
                    </div>

                    <p className="text-xs text-[var(--color-text-2)] mt-1 leading-relaxed line-clamp-2">
                      {product.shortReason || product.description}
                    </p>

                    {/* Tags */}
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-[9px] font-semibold px-2 py-0.5 rounded-full border border-[var(--color-border)] text-[var(--color-muted)]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Add button */}
                <button
                  onClick={() => !isAdded && handleAdd(product)}
                  disabled={isAdded}
                  className={`mt-3 w-full py-2.5 rounded-xl text-xs font-bold tracking-wide transition-all active:scale-95 ${
                    isAdded
                      ? 'bg-[var(--color-surface-2)] text-[var(--color-muted)] cursor-default'
                      : 'bg-[var(--color-accent)] text-[var(--color-bg)]'
                  }`}
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {isAdded ? '✓ Added to stack' : '+ Add to stack'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
