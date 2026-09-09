'use client'

import { useState } from 'react'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { ShopBundleView } from '@/hooks/useShopBundles'
import { SHELF_PREVIEW_COUNT } from '@/lib/shop/categories'
import { Button } from '@/components/storefront'
import { ShopBundleCard } from './ShopBundleCard'

interface Props {
  bundles: ShopBundleView[]
  products: CatalogueProduct[]
}

/** The session stacks shelf: the same two-column grid as every product category. */
export function ShopBundlesRow({ bundles, products }: Props) {
  // Capped at two rows like every other shelf — a bundle card is taller than a
  // product card, so an uncapped bundles row is the one that pushes the whole
  // catalogue off the first screen.
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? bundles : bundles.slice(0, SHELF_PREVIEW_COUNT)
  const hidden = bundles.length - SHELF_PREVIEW_COUNT

  if (bundles.length === 0) return null

  return (
    /*
      The same two-column grid as every other shelf, and the same
      `scroll-margin-top`. The deck's desktop scroll arrows are gone with it:
      they were 36px circles absolutely positioned at `left-2` / `right-2`,
      floating over the first and last card's content at exactly the viewport
      edges where a thumb already is.
    */
    <section className="sf-shelf" id="shop-cat-bundles" style={{ scrollMarginTop: 88, paddingTop: 'var(--space-8)' }}>
      <div className="flex items-baseline justify-between" style={{ padding: '0 var(--space-4)', marginBottom: 'var(--space-4)', gap: 'var(--space-3)' }}>
        <h2 className="sf-title min-w-0" style={{ color: 'var(--text)' }}>Session stacks</h2>
        <span className="sf-meta flex-shrink-0">
          <span className="sf-num">{bundles.length}</span> stack{bundles.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div
        className="grid"
        style={{
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 'var(--space-4)',
          padding: '0 var(--space-4)' }}
      >
        {shown.map((view) => (
          <div key={view.bundle.slug} data-card>
            <ShopBundleCard view={view} products={products} />
          </div>
        ))}
      </div>

      {hidden > 0 && (
        <div style={{ padding: 'var(--space-3) var(--space-4) 0' }}>
          <Button
            variant="secondary"
            size="sm"
            fullWidth
            aria-expanded={expanded}
            aria-controls="shop-cat-bundles"
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded ? 'Show fewer session stacks' : `Show all ${bundles.length} session stacks`}
          </Button>
        </div>
      )}
    </section>
  )
}
