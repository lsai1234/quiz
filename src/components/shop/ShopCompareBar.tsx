'use client'

import type { CatalogueProduct } from '@/lib/catalogue/types'
import { MAX_DUEL_PRODUCTS } from '@/lib/shop/duel'
import { ProductTile } from '@/components/stack-review/ProductTile'

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
    <div
      className="flex items-center gap-2 rounded-xl pl-2.5 pr-1.5 py-2 max-w-lg mx-auto w-full"
      style={{
        background: 'color-mix(in srgb, var(--color-accent) 9%, var(--color-surface))',
        border: '1px solid color-mix(in srgb, var(--color-accent) 26%, transparent)',
      }}
    >
      <div className="flex items-center gap-1 flex-shrink-0" aria-hidden>
        {products.map((product) => (
          <ProductTile
            key={product.id}
            imageUrl={product.imageUrl}
            slot={product.stackSlots[0]}
            title={product.title}
            size={26}
          />
        ))}
      </div>

      <p className="flex-1 min-w-0 text-[11px] font-semibold leading-snug" style={{ color: 'var(--color-text-2)' }}>
        {ready
          ? `${products[0].title} vs ${products[1].title}`
          : 'Pick one more to compare'}
      </p>

      {ready && (
        <button
          onClick={onOpen}
          className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold active:scale-95 transition-transform"
          style={{ background: 'var(--color-accent)', color: 'var(--color-bg)', fontFamily: 'var(--font-display)' }}
        >
          Compare
        </button>
      )}

      <button
        onClick={onClear}
        aria-label="Clear comparison"
        className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center active:scale-90 transition-transform"
        style={{ color: 'var(--color-muted)' }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
