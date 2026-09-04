'use client'

import { useMemo } from 'react'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { selectShopAxes } from '@/lib/stack-stats'
import { ShopProductCard } from './ShopProductCard'

interface Props {
  products: CatalogueProduct[]
  /** What was typed, for the heading. Empty when only filters are narrowing. */
  query: string
  /** True when these results came from the one-edit typo fallback. */
  fuzzy: boolean
  onOpen: (product: CatalogueProduct, rank: number) => void
}

/**
 * Search results as a grid.
 *
 * Not a swipe deck. The horizontal decks are right for browsing a shelf — a
 * curated set you flick through — and wrong for a result set, where the whole
 * question is "how many, and is what I want in there". A deck answers neither
 * without swiping.
 *
 * One column on a phone rather than two: `ShopProductCard` carries a 56px tile,
 * a two-line title, a price row and a stat block, and at ~165px wide (two
 * columns at 360px) the title clamps to nothing and the add button wraps. The
 * card sets the column count, not the other way round.
 */
export function ShopResultsGrid({ products, query, fuzzy, onOpen }: Props) {
  // Axes drawn from the result set itself, so the stat bars compare the things
  // actually on screen — the same trick the category shelves use.
  const axes = useMemo(() => selectShopAxes(products), [products])

  return (
    <section aria-label="Search results" style={{ padding: 'var(--space-4) var(--space-4) 0' }}>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="sf-title" style={{ color: 'var(--text)' }}>
          {products.length} {products.length === 1 ? 'result' : 'results'}
          {query && (
            <>
              {' for '}
              <span style={{ color: 'var(--text)' }}>&ldquo;{query}&rdquo;</span>
            </>
          )}
        </h2>
      </div>

      {fuzzy && (
        <p className="sf-meta" style={{ marginBottom: 'var(--space-3)' }}>
          Nothing matched exactly — showing the closest spellings.
        </p>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-4)' }}>
        {/*
          `data-card` marks a product card for the rest of the app — the deck
          animations query it, and every e2e card selector is built on it. It
          sits on the wrapper here for the same reason it does in `ShopSection`.
        */}
        {products.map((product, i) => (
          <div key={product.id} data-card>
            <ShopProductCard
              product={product}
              onOpen={() => onOpen(product, i)}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
