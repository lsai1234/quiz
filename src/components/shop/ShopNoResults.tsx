'use client'

import { useMemo } from 'react'
import type { CatalogueProduct, DietaryTag } from '@/lib/catalogue/types'
import { DIETARY_LABEL } from '@/lib/product-facts'
import { selectShopAxes } from '@/lib/stack-stats'
import { searchProducts, suggestTerm, type SearchIndex } from '@/lib/shop/search'
import { EMPTY_QUERY, type ShopQuery } from '@/lib/shop/shop-query'
import { ShopProductCard } from './ShopProductCard'

/** How many near-misses to offer. Enough to be useful, few enough to scan. */
const FALLBACK_COUNT = 6

interface Props {
  products: CatalogueProduct[]
  index: SearchIndex
  query: ShopQuery
  onQueryChange: (query: ShopQuery) => void
  onExpand: (product: CatalogueProduct) => void
}

/**
 * The empty state, treated as our failure rather than the shopper's.
 *
 * Three recoveries, in the order they are likely to help:
 *
 *   1. A spelling suggestion, when one exists.
 *   2. One tap to drop any single filter that is narrowing things — so a query
 *      that is only failing because of a stray "Vegan" chip is one tap from
 *      working, rather than needing Clear All and a retype.
 *   3. The nearest products anyway, ignoring the filters entirely. A dead end
 *      with nothing on it is the one outcome guaranteed to end the visit.
 */
export function ShopNoResults({ products, index, query, onQueryChange, onExpand }: Props) {
  const suggestion = useMemo(
    () => (query.q.trim() ? suggestTerm(index, query.q) : null),
    [index, query.q],
  )

  // The nearest products, searched with every filter dropped — the point is to
  // show what the shop DOES have, so honouring the filters that just excluded
  // everything would defeat it. Falls back to the catalogue's own ranking when
  // there is no text to be near.
  const nearest = useMemo(() => {
    const text = query.q.trim()
    if (text) {
      const hits = searchProducts(index, text).hits
      if (hits.length > 0) return hits.slice(0, FALLBACK_COUNT).map((h) => h.product)
    }
    return [...products]
      .sort((a, b) => (a.topRank ?? Number.MAX_SAFE_INTEGER) - (b.topRank ?? Number.MAX_SAFE_INTEGER))
      .slice(0, FALLBACK_COUNT)
  }, [index, products, query.q])

  const axes = useMemo(() => selectShopAxes(nearest), [nearest])

  const dropDietary = (tag: DietaryTag) =>
    onQueryChange({ ...query, dietary: query.dietary.filter((t) => t !== tag) })

  return (
    <section className="px-5 pt-8 pb-2 max-w-5xl mx-auto">
      <div className="max-w-lg mx-auto text-center">
        <p className="text-sm font-bold" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          {query.q.trim() ? <>Nothing matched &ldquo;{query.q.trim()}&rdquo;</> : 'Nothing matches those filters'}
        </p>

        {suggestion && (
          <p className="text-xs mt-2" style={{ color: 'var(--color-muted)' }}>
            Did you mean{' '}
            <button
              onClick={() => onQueryChange({ ...query, q: suggestion })}
              className="font-bold underline underline-offset-2 active:opacity-70"
              style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-display)' }}
            >
              {suggestion}
            </button>
            ?
          </p>
        )}

        {/* One tap to relax whatever is narrowing this. */}
        {query.dietary.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            {query.dietary.map((tag) => (
              <button
                key={tag}
                onClick={() => dropDietary(tag)}
                className="px-3 py-1.5 rounded-full text-xs font-bold active:scale-95 transition-transform"
                style={{
                  fontFamily: 'var(--font-display)',
                  color: 'var(--color-text-2)',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border-2)',
                }}
              >
                Remove &ldquo;{DIETARY_LABEL[tag]}&rdquo;
              </button>
            ))}
          </div>
        )}

        {/*
          "Start over", not "Clear search": the search box already has a Clear
          button of its own, and two controls with the same accessible name in
          one view is a genuine ambiguity for anyone navigating by name. This one
          also does more — it drops the dietary filters too.
        */}
        <button
          onClick={() => onQueryChange(EMPTY_QUERY)}
          className="mt-4 px-5 py-2.5 rounded-xl text-xs font-bold active:scale-95 transition-transform"
          style={{ background: 'var(--color-accent)', color: 'var(--color-bg)', fontFamily: 'var(--font-display)' }}
        >
          Start over
        </button>
      </div>

      {nearest.length > 0 && (
        <div className="mt-10">
          <h3 className="text-sm font-black mb-3" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}>
            {query.q.trim() ? 'Closest we stock' : 'Popular right now'}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {nearest.map((product) => (
              <div key={product.id} data-card>
                <ShopProductCard
                  product={product}
                  onExpand={onExpand}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
