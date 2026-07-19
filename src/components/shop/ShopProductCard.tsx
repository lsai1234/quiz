'use client'

import { useEffect, useRef, useState } from 'react'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { productBars, type StatAxis } from '@/lib/stack-stats'
import { slotVisual } from '@/lib/catalogue/slot-visuals'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { dealInfo, productBadge } from '@/lib/shop/merchandising'
import { useBasket } from '@/lib/basket/store'
import { ProductTile } from '@/components/stack-review/ProductTile'
import { StatBars } from '@/components/stack-review/StatBars'

interface Props {
  product: CatalogueProduct
  /** Shared section axes so cards in a category compare like top-trumps. */
  axes: StatAxis[]
  /** Play the bar sweep (deck deal-in). */
  animate?: boolean
  /** Open the detail sheet (wired in S4). */
  onExpand?: (product: CatalogueProduct) => void
}

export function ShopProductCard({ product, axes, animate = true, onExpand }: Props) {
  const add = useBasket((s) => s.add)
  const [justAdded, setJustAdded] = useState(false)
  const [reduced, setReduced] = useState(false)
  const addTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    return () => { if (addTimer.current) clearTimeout(addTimer.current) }
  }, [])

  const hue = slotVisual(product.stackSlots[0]).hue
  const variant = product.variants.find((v) => v.available) ?? product.variants[0]
  const { price, rrp, onDeal, pct: discountPct } = dealInfo(product)
  const badge = productBadge(product)
  const soldOut = !variant?.available
  const bars = productBars(product, axes)

  const handleAdd = () => {
    if (!variant || soldOut) return
    add(product.id, variant.id, 1)
    if (reduced) return
    setJustAdded(true)
    if (addTimer.current) clearTimeout(addTimer.current)
    addTimer.current = setTimeout(() => setJustAdded(false), 1300)
  }

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden h-full"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      {/* Expandable body */}
      <button
        onClick={() => onExpand?.(product)}
        className="flex flex-col text-left active:opacity-90 transition-opacity"
      >
        <div className="p-4 pb-3 flex items-center gap-3">
          <div className="relative">
            <ProductTile imageUrl={product.imageUrl} slot={product.stackSlots[0]} title={product.title} size={56} />
            {onDeal && (
              <span
                className="absolute -top-1.5 -left-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-black"
                style={{ background: 'var(--color-accent)', color: 'var(--color-bg)', fontFamily: 'var(--font-display)' }}
              >
                -{discountPct}%
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <span
                className="inline-block px-2 py-0.5 rounded-full text-[8px] font-bold tracking-widest uppercase"
                style={{
                  color: hue,
                  background: `color-mix(in srgb, ${hue} 12%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${hue} 24%, transparent)`,
                  fontFamily: 'var(--font-display)',
                }}
              >
                {product.category}
              </span>
              {badge && (
                <span
                  className="inline-block px-2 py-0.5 rounded-full text-[8px] font-bold tracking-widest uppercase"
                  style={{
                    color: 'var(--color-accent)',
                    background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--color-accent) 24%, transparent)',
                    fontFamily: 'var(--font-display)',
                  }}
                >
                  {badge}
                </span>
              )}
            </div>
            <p className="text-sm font-bold leading-snug line-clamp-2" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
              {product.title}
            </p>
          </div>
        </div>

        <div className="px-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs leading-snug line-clamp-1 flex-1 min-w-0 pr-2" style={{ color: 'var(--color-muted)' }}>
              {product.shortReason || product.description}
            </p>
            <span className="flex items-baseline gap-1.5 flex-shrink-0">
              {onDeal && (
                <span className="text-[11px] line-through" style={{ color: 'var(--color-muted)' }}>{formatGBP(rrp!)}</span>
              )}
              <span className="text-base font-black" style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-display)' }}>
                {formatGBP(price)}
              </span>
            </span>
          </div>
        </div>

        <StatBars
          bars={bars}
          animate={animate}
          label="Best for"
          className="px-4 pt-3.5 pb-3 mt-2 flex-1"
          style={{ borderTop: '1px solid var(--color-border)' }}
        />
      </button>

      {/* Add to basket */}
      <div className="p-3" style={{ borderTop: '1px solid var(--color-border)' }}>
        <button
          onClick={handleAdd}
          disabled={soldOut}
          className="w-full py-3 rounded-xl text-sm font-bold active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            fontFamily: 'var(--font-display)',
            background: justAdded ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)' : 'var(--color-accent)',
            color: justAdded ? 'var(--color-accent)' : 'var(--color-bg)',
            border: justAdded ? '1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)' : '1px solid transparent',
          }}
        >
          {soldOut ? 'Sold out' : justAdded ? 'Added ✓' : 'Add to basket'}
        </button>
      </div>
    </div>
  )
}
