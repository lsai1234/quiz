'use client'

import type { CatalogueProduct } from '@/lib/catalogue/types'
import { ProductTile } from './ProductTile'
import { shortNameOf } from '@/lib/catalogue/short-name'
import { productTypeLabel } from '@/lib/catalogue/product-type'

const ACCENT = '#00D4FF'

interface Props {
  boosters: CatalogueProduct[]
  onAdd: (product: CatalogueProduct) => void
}

/**
 * The final card in the stack deck: optional add-ons, each with its product
 * type and a one-tap add. Adding one inserts its own card into the deck (and
 * drops it from this list).
 *
 * The chip is the product type ("Magnesium"). It used to be "+Sleep", the goal
 * the product would add, which links a health goal to a product — a claim.
 */
export function UpgradesCard({ boosters, onAdd }: Props) {
  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden h-full"
      style={{ background: 'var(--color-surface)', border: '1px dashed var(--color-border-2)' }}
    >
      <div className="p-4 pb-2">
        <p className="text-[9px] font-bold tracking-widest uppercase mb-1" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>
          Optional add-ons
        </p>
        <h3 className="text-lg font-black leading-tight" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          Complete your stack
        </h3>
      </div>

      {boosters.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-5 py-8 text-center">
          <span style={{ color: ACCENT }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <p className="text-sm font-bold mt-2" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
            You&rsquo;re all set
          </p>
          {/* Not "covers your goals": that says the stack does something for
              them, which is a claim. */}
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-2)' }}>
            Nothing else to add right now.
          </p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-2 px-3 pb-3 pt-1 overflow-y-auto">
          {boosters.map((product) => {
            const firstVariant = product.variants.find((v) => v.available) ?? product.variants[0]
            const price = firstVariant?.price ?? product.basePrice
            return (
              <div
                key={product.id}
                className="flex items-center gap-2.5 rounded-xl p-2"
                style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
              >
                <ProductTile imageUrl={product.imageUrl} formats={product.formats} title={product.title} size={40} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold leading-snug truncate" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
                    {shortNameOf(product)}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    <span
                      className="text-[8px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ color: ACCENT, background: `color-mix(in srgb, ${ACCENT} 10%, transparent)`, fontFamily: 'var(--font-display)' }}
                    >
                      {productTypeLabel(product)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-xs font-black" style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-display)' }}>
                    £{price.toFixed(2)}
                  </span>
                  <button
                    onClick={() => onAdd(product)}
                    className="text-[10px] font-bold px-2.5 py-1 rounded-full active:scale-90 transition-transform"
                    style={{ background: 'var(--color-accent)', color: 'var(--color-bg)', fontFamily: 'var(--font-display)' }}
                  >
                    + Add
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
