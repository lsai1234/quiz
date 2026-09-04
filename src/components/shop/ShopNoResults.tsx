'use client'

import { useMemo } from 'react'
import type { CatalogueProduct, DietaryTag } from '@/lib/catalogue/types'
import { DIETARY_LABEL } from '@/lib/product-facts'
import { selectShopAxes } from '@/lib/stack-stats'
import { searchProducts, suggestTerm, type SearchIndex } from '@/lib/shop/search'
import { EMPTY_QUERY, type ShopQuery } from '@/lib/shop/shop-query'
import { ShopProductCard } from './ShopProductCard'
import { Button, Chip } from '@/components/storefront'

/** How many near-misses to offer. Enough to be useful, few enough to scan. */
const FALLBACK_COUNT = 6

interface Props {
  products: CatalogueProduct[]
  index: SearchIndex
  query: ShopQuery
  onQueryChange: (query: ShopQuery) => void
  onOpen: (product: CatalogueProduct) => void
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
export function ShopNoResults({ products, index, query, onQueryChange, onOpen }: Props) {
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
    <section style={{ padding: 'var(--space-8) var(--space-4) var(--space-2)' }}>
      <div className="max-w-lg mx-auto text-center">
        {/*
          A drawn empty state, not a paragraph.

          Nothing found is the moment a shopper is most likely to leave, and it
          was three lines of grey text on a black page — indistinguishable from
          the page having failed. An empty shelf is a picture anyone reads
          instantly, and it says "we looked" rather than "something broke".
        */}
        <svg
          width="72" height="72" viewBox="0 0 72 72" fill="none" aria-hidden
          className="mx-auto"
          style={{ color: 'var(--text-dim)', opacity: 0.5, marginBottom: 'var(--space-4)' }}
        >
          <rect x="10" y="20" width="52" height="6" rx="3" fill="currentColor" opacity="0.55" />
          <rect x="10" y="44" width="52" height="6" rx="3" fill="currentColor" opacity="0.55" />
          <path d="M16 26v18M56 26v18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.35" />
          <circle cx="36" cy="35" r="9" stroke="currentColor" strokeWidth="2.5" />
          <path d="M42.5 41.5 49 48" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>

        <p className="sf-title" style={{ color: 'var(--text)' }}>
          {query.q.trim() ? <>Nothing matched &ldquo;{query.q.trim()}&rdquo;</> : 'Nothing matches those filters'}
        </p>

        {suggestion && (
          <p className="sf-meta" style={{ marginTop: 'var(--space-2)' }}>
            Did you mean{' '}
            <button
              onClick={() => onQueryChange({ ...query, q: suggestion })}
              data-interactive
              className="underline underline-offset-2"
              style={{ color: 'var(--text)', background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }}
            >
              {suggestion}
            </button>
            ?
          </p>
        )}

        {/* One tap to relax whatever is narrowing this. */}
        {query.dietary.length > 0 && (
          <div className="flex flex-wrap justify-center" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
            {query.dietary.map((tag) => (
              <Chip key={tag} onClick={() => dropDietary(tag)}>
                Remove &ldquo;{DIETARY_LABEL[tag]}&rdquo;
              </Chip>
            ))}
          </div>
        )}

        {/*
          "Start over", not "Clear search": the search box already has a Clear
          button of its own, and two controls with the same accessible name in
          one view is a genuine ambiguity for anyone navigating by name. This one
          also does more — it drops the dietary filters too.
        */}
        <div style={{ marginTop: 'var(--space-5)' }}>
          <Button variant="secondary" size="md" onClick={() => onQueryChange(EMPTY_QUERY)}>
          Start over
          </Button>
        </div>
      </div>

      {nearest.length > 0 && (
        <div style={{ marginTop: 'var(--space-12)' }}>
          <h3 className="sf-title" style={{ color: 'var(--text)', marginBottom: 'var(--space-4)' }}>
            {query.q.trim() ? 'Closest we stock' : 'Popular right now'}
          </h3>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-3)' }}>
            {nearest.map((product) => (
              <div key={product.id} data-card>
                <ShopProductCard
                  product={product}
                  onOpen={onOpen}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
