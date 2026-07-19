'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { ShopCategory } from '@/lib/shop/categories'
import { selectShopAxes } from '@/lib/stack-stats'
import { ShopProductCard } from './ShopProductCard'

interface Props {
  section: ShopCategory
  onExpand?: (product: CatalogueProduct) => void
  /** 'deal' gives the header the accent treatment (the top Deals rail). */
  tone?: 'default' | 'deal'
  /** Optional line under the section title (e.g. "Save up to 25%"). */
  subtitle?: string
}

/**
 * One shop category as a horizontal swipe deck of product cards. The cards
 * share a set of stat axes (derived from the section's own products) so
 * swiping compares them like top-trumps within the category.
 */
export function ShopSection({ section, onExpand, tone = 'default', subtitle }: Props) {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])

  const axes = useMemo(() => selectShopAxes(section.products), [section.products])

  return (
    <section id={`shop-cat-${section.slug}`} className="scroll-mt-24 pt-8">
      <div className="px-5 max-w-lg mx-auto mb-3 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h2
            className="text-2xl font-black tracking-tight flex items-center gap-1.5"
            style={{ fontFamily: 'var(--font-display)', color: tone === 'deal' ? 'var(--color-accent)' : 'var(--color-text)' }}
          >
            {tone === 'deal' && <span aria-hidden>⚡</span>}
            {section.category}
          </h2>
          {subtitle && (
            <p className="text-[11px] font-semibold mt-0.5" style={{ color: 'var(--color-accent)' }}>{subtitle}</p>
          )}
        </div>
        <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: 'var(--color-muted)' }}>
          {section.products.length} product{section.products.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div
        className="flex gap-3 overflow-x-auto px-5 pb-1 snap-x snap-mandatory scrollbar-hide"
        style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
      >
        {section.products.map((product) => (
          <div key={product.id} className="snap-center flex-shrink-0 w-[80vw] max-w-[300px]">
            <ShopProductCard product={product} axes={axes} animate={!reduced} onExpand={onExpand} />
          </div>
        ))}
      </div>
    </section>
  )
}
