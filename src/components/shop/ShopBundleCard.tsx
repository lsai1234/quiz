'use client'

import Link from 'next/link'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { ShopBundleView } from '@/hooks/useShopBundles'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { ProductTile } from '@/components/stack-review/ProductTile'
import { Badge } from '@/components/storefront'

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
    /*
      A bundle card is a product card with more than one product in it, so it is
      built the same way: surface fill, no border, no gradient, image area, name,
      price, one action. It carried an accent gradient, an accent border, an
      accent badge, an accent tagline, an accent price, an accent saving line
      and a filled accent button — seven accent objects on one card.
    */
    <Link
      href={`/bundles/${bundle.slug}`}
      data-interactive
      className="flex flex-col overflow-hidden h-full"
      style={{ background: 'var(--surface)', borderRadius: 'var(--r-card)' }}
    >
      <div className="flex flex-col flex-1" style={{ padding: 'var(--space-5)', gap: 'var(--space-3)' }}>
        <Badge>{bundle.seriesName}</Badge>

        <p className="sf-body sf-clamp-2" style={{ color: 'var(--text)' }}>{bundle.name}</p>

        <div className="flex items-center" style={{ gap: 'var(--space-2)' }}>
          {coreSlots.map((slot) => {
            const product = byId.get(slot.selectedProductId)
            return (
              <ProductTile
                key={slot.slotId}
                imageUrl={product?.imageUrl ?? null}
                slot={slot.slotType}
                title={product?.title ?? slot.title}
                size={36}
              />
            )
          })}
        </div>

        <p className="sf-meta"><span className="sf-num">{coreSlots.length}</span> products</p>

        <p className="sf-num sf-body" style={{ color: 'var(--text)', marginTop: 'auto' }}>
          {formatGBP(price.price)}
        </p>
      </div>

      <div style={{ padding: '0 var(--space-5) var(--space-5)' }}>
        <span
          className="sf-button inline-flex items-center justify-center w-full"
          style={{
            minHeight: 36,
            padding: '0 var(--space-3)',
            fontSize: 'var(--meta-size)',
            fontFamily: 'var(--font-sans)',
            fontWeight: 'var(--weight-medium)',
            borderRadius: 'var(--r-control)',
            background: 'var(--surface-hi)',
            color: 'var(--text)',
          }}
        >
          View bundle
        </span>
      </div>
    </Link>
  )
}
