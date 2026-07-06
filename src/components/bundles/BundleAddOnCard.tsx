'use client'

import type { BundleAddOn } from '@/lib/bundles'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { formatGBP } from '@/lib/stack-blueprint/pricing'

interface Props {
  addOn: BundleAddOn
  product: CatalogueProduct
  added: boolean
  onAdd: (addOn: BundleAddOn) => void
}

export function BundleAddOnCard({ addOn, product, added, onAdd }: Props) {
  const variant = product.variants.find((v) => v.available) ?? product.variants[0]
  const price = variant?.price ?? product.basePrice

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
          Optional · {addOn.title}
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
      <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-text-2)' }}>
        {addOn.reason}
      </p>

      <button
        onClick={() => onAdd(addOn)}
        disabled={added}
        className="mt-3 w-full py-2.5 rounded-xl text-xs font-bold transition-all active:scale-[0.98] disabled:cursor-default"
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
        {added ? 'Added to bundle ✓' : 'Add to bundle +'}
      </button>
    </div>
  )
}
