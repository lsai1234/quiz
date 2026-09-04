'use client'

import type { CatalogueProduct } from '@/lib/catalogue/types'
import { MAX_DUEL_PRODUCTS } from '@/lib/shop/duel'
import { ProductTile } from '@/components/stack-review/ProductTile'
import { Button } from '@/components/storefront'

interface Props {
  /** Products picked so far, in pick order. Never more than `MAX_DUEL_PRODUCTS`. */
  products: CatalogueProduct[]
  onOpen: () => void
  onClear: () => void
}

/**
 * The tray that assembles a duel.
 *
 * It appears on the first pick rather than the second, because a compare toggle
 * that does nothing visible until you find a second product is a control nobody
 * learns. With one picked it says what it is waiting for; with two it becomes
 * the button.
 */
export function ShopCompareBar({ products, onOpen, onClear }: Props) {
  const ready = products.length >= MAX_DUEL_PRODUCTS

  return (
    /*
      One bar at the bottom, never two.

      This used to stack above the basket bar, so a shopper assembling a duel
      with something already in the basket lost two rows of a 844px viewport to
      floating chrome — over browser UI, on top of the cards they were choosing
      from. It is now a single row: the picks, what it is waiting for, and the
      action, at the same height as the basket bar it replaces.
    */
    <div
      className="flex items-center w-full"
      style={{
        gap: 'var(--space-3)',
        minHeight: 52,
        padding: '0 var(--space-2) 0 var(--space-3)',
        borderRadius: 'var(--r-control)',
        background: 'var(--surface-hi)',
      }}
    >
      <div className="flex items-center flex-shrink-0" style={{ gap: 'var(--space-1)' }} aria-hidden>
        {products.map((product) => (
          <ProductTile
            key={product.id}
            imageUrl={product.imageUrl}
            slot={product.stackSlots[0]}
            title={product.title}
            size={56}
            style={{ width: 28, height: 28 }}
          />
        ))}
      </div>

      <p className="sf-meta flex-1 min-w-0 truncate" style={{ color: ready ? 'var(--text)' : undefined }}>
        {ready ? `${products[0].title} vs ${products[1].title}` : 'Pick one more to compare'}
      </p>

      {ready && (
        <Button variant="primary" size="sm" onClick={onOpen} className="flex-shrink-0">
          Compare
        </Button>
      )}

      <Button variant="ghost" size="sm" onClick={onClear} aria-label="Clear comparison" className="flex-shrink-0">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </Button>
    </div>
  )
}
