'use client'

import Link from 'next/link'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { ShopBundleView } from '@/hooks/useShopBundles'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { ProductTile } from '@/components/stack-review/ProductTile'

interface Props {
  view: ShopBundleView
  /** Catalogue, for resolving the core products' thumbnails. */
  products: CatalogueProduct[]
}

/**
 * A bundle as a shop card — deliberately distinct from a product card. It leads
 * with the bundle's story (series + name + tagline), shows the products as a
 * thumbnail strip, prices the bundle against the sum of its parts, and flags the
 * included workout. The whole card links to the bundle's landing page.
 */
export function ShopBundleCard({ view, products }: Props) {
  const { bundle, price } = view
  const byId = new Map(products.map((p) => [p.id, p]))
  const coreSlots = [...bundle.blueprint.slots].sort((a, b) => a.displayOrder - b.displayOrder)

  return (
    <Link
      href={`/bundles/${bundle.slug}`}
      className="flex flex-col rounded-2xl overflow-hidden h-full active:scale-[0.98] transition-transform"
      style={{
        background: 'linear-gradient(180deg, color-mix(in srgb, var(--color-accent) 7%, var(--color-surface)) 0%, var(--color-surface) 42%)',
        border: '1px solid color-mix(in srgb, var(--color-accent) 26%, var(--color-border))',
      }}
    >
      {/* Header — series + name + tagline */}
      <div className="p-4 pb-3">
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <span
            className="inline-block px-2 py-0.5 rounded-full label"
            style={{
              color: 'var(--color-accent)',
              background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
              fontFamily: 'var(--font-display)',
            }}
          >
            Bundle
          </span>
          <span
            className="inline-block px-2 py-0.5 rounded-full label"
            style={{
              color: 'var(--color-muted)',
              border: '1px solid var(--color-border-2)',
              fontFamily: 'var(--font-display)',
            }}
          >
            {bundle.seriesName}
          </span>
        </div>
        <p className="text-lg font-black leading-tight tracking-tight" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          {bundle.name}
        </p>
        <p className="label mt-1" style={{ color: 'var(--color-accent)' }}>
          {bundle.tagline}
        </p>
      </div>

      {/* Product thumbnail strip */}
      <div className="px-4 flex items-center gap-2">
        {coreSlots.map((slot) => {
          const product = byId.get(slot.selectedProductId)
          return (
            <ProductTile
              key={slot.slotId}
              imageUrl={product?.imageUrl ?? null}
              slot={slot.slotType}
              title={product?.title ?? slot.title}
              size={44}
            />
          )
        })}
        <span className="text-xs font-bold" style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-display)' }}>
          {coreSlots.length} products
        </span>
      </div>

      {/* Blurb */}
      <p className="px-4 pt-3 text-xs leading-snug line-clamp-2 flex-1" style={{ color: 'var(--color-text-2)' }}>
        {bundle.description}
      </p>

      {/* Price + workout marker */}
      <div className="p-4 pt-3 mt-1" style={{ borderTop: '1px solid var(--color-border)' }}>
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5">
              {price.saving > 0 && (
                <span className="text-[11px] line-through tabular-nums" style={{ color: 'var(--color-muted)' }}>
                  {formatGBP(price.sumOfParts)}
                </span>
              )}
              <span className="text-xl font-black tabular-nums" style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-display)' }}>
                {formatGBP(price.price)}
              </span>
            </div>
            {price.saving > 0 && (
              <p className="text-[10px] font-bold mt-0.5" style={{ color: 'var(--color-accent)' }}>
                Save {formatGBP(price.saving)} vs buying separately
              </p>
            )}
          </div>
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full label flex-shrink-0"
            style={{ color: 'var(--color-text-2)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border-2)' }}
          >
            + Workout
          </span>
        </div>
        <div
          className="mt-3 w-full py-2.5 rounded-xl text-xs font-bold text-center"
          style={{ background: 'var(--color-accent)', color: 'var(--color-bg)', fontFamily: 'var(--font-display)' }}
        >
          View bundle →
        </div>
      </div>
    </Link>
  )
}
