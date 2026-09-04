'use client'

import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { ShopBundleView } from '@/hooks/useShopBundles'
import { ShopBundleCard } from './ShopBundleCard'

interface Props {
  bundles: ShopBundleView[]
  products: CatalogueProduct[]
}

/** The bundles shelf: the same two-column grid as every product category. */
export function ShopBundlesRow({ bundles, products }: Props) {
  if (bundles.length === 0) return null

  return (
    /*
      The same two-column grid as every other shelf, and the same
      `scroll-margin-top`. The deck's desktop scroll arrows are gone with it:
      they were 36px circles absolutely positioned at `left-2` / `right-2`,
      floating over the first and last card's content at exactly the viewport
      edges where a thumb already is.
    */
    <section id="shop-cat-bundles" style={{ scrollMarginTop: 88, paddingTop: 'var(--space-8)' }}>
      <div className="flex items-baseline justify-between" style={{ padding: '0 var(--space-4)', marginBottom: 'var(--space-4)', gap: 'var(--space-3)' }}>
        <h2 className="sf-title min-w-0" style={{ color: 'var(--text)' }}>Bundles</h2>
        <span className="sf-meta flex-shrink-0">
          <span className="sf-num">{bundles.length}</span> bundle{bundles.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div
        className="grid"
        style={{
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 'var(--space-4)',
          padding: '0 var(--space-4)',
        }}
      >
        {bundles.map((view) => (
          <div key={view.bundle.slug} data-card>
            <ShopBundleCard view={view} products={products} />
          </div>
        ))}
      </div>
    </section>
  )
}
