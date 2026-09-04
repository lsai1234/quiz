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
      {/*
        A bundle is a stack, so the stack is the picture: the products it
        contains, on the same lit ground a single product gets. That is the
        card's focal point, and it is what a "3 products" line was standing in
        for before.
      */}
      <div className="relative flex items-end justify-center" style={{ height: 128, gap: 'var(--space-1)', padding: '0 var(--space-4)' }}>
        <span
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 60% 52% at 50% 62%, rgba(255,255,255,0.06), transparent 70%)' }}
        />
        {coreSlots.slice(0, 3).map((slot, i) => {
          const product = byId.get(slot.selectedProductId)
          return (
            <ProductTile
              key={slot.slotId}
              imageUrl={product?.imageUrl ?? null}
              slot={slot.slotType}
              title=""
              size={96}
              style={{ width: 42, height: 92 - Math.abs(1 - i) * 12, position: 'relative' }}
            />
          )
        })}
      </div>

      <div className="flex flex-col flex-1" style={{ padding: 'var(--space-3)', gap: 2 }}>
        <p className="sf-label truncate">{bundle.seriesName}</p>
        <p className="sf-price">{formatGBP(price.price)}</p>
        <p className="sf-name sf-clamp-2" style={{ marginTop: 2 }}>{bundle.name}</p>
        <p className="sf-meta sf-tnum">{coreSlots.length} products</p>
      </div>

      <div style={{ padding: '0 var(--space-3) var(--space-3)' }}>
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
            color: 'var(--text)' }}
        >
          View bundle
        </span>
      </div>
    </Link>
  )
}
