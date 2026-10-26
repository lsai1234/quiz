'use client'

import type { BundleAddOn } from '@/lib/bundles'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { productTypeLabel } from '@/lib/catalogue/product-type'
import { cardFacts } from '@/lib/results/card-facts'
import { formatPerServing } from '@/lib/shop/per-serving'

interface Props {
  addOn: BundleAddOn
  product: CatalogueProduct
  added: boolean
  onAdd: (addOn: BundleAddOn) => void
  onRemove: (slotId: string) => void
}

/**
 * An optional extra on a bundle page. It says what the product is and what a
 * pack holds and costs. Not the add-on's title or reason: both are written per
 * bundle and say what the product is for ("Sleep Support", "to help you wind
 * down"), which beside a product is a health claim.
 */
export function BundleAddOnCard({ addOn, product, added, onAdd, onRemove }: Props) {
  const facts = cardFacts({ product })
  const price = facts.price
  const factLine = [
    facts.servings != null ? `${Math.max(1, Math.round(facts.servings))} servings` : null,
    facts.perServing != null ? `${formatPerServing(facts.perServing)} per serving` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: 'var(--color-surface)',
        border: '1px dashed var(--color-border-2)',
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span
          className="px-2.5 py-1 rounded-full text-[9px] font-bold tracking-widest uppercase"
          style={{
            fontFamily: 'var(--font-display)',
            color: 'var(--color-muted)',
            border: '1px solid var(--color-border-2)',
          }}
        >
          Optional · {productTypeLabel(product)}
        </span>
        <span
          className="text-sm font-black"
          style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}
        >
          +{formatGBP(price)}
        </span>
      </div>

      <p className="text-sm font-bold" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
        {product.title}
      </p>
      {factLine && (
        <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-text-2)' }}>
          {factLine}
        </p>
      )}

      <button
        onClick={() => (added ? onRemove(addOn.slotId) : onAdd(addOn))}
        className="mt-3 w-full py-2.5 rounded-xl text-xs font-bold transition-all active:scale-[0.98]"
        style={
          added
            ? {
                color: 'var(--color-muted)',
                border: '1px solid var(--color-border)',
                fontFamily: 'var(--font-display)',
              }
            : {
                color: 'var(--color-accent)',
                background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
                border: '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)',
                fontFamily: 'var(--font-display)',
              }
        }
      >
        {added ? 'Added to bundle · Remove' : 'Add to bundle'}
      </button>
    </div>
  )
}
