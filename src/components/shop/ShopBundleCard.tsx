'use client'

import Link from 'next/link'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { ShopBundleView } from '@/hooks/useShopBundles'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { ProductTile } from '@/components/stack-review/ProductTile'
import { bundleWorkouts } from '@/lib/bundles/resolve'
import { Icon } from '@/components/ui/Icon'

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
  const workoutCount = bundleWorkouts(bundle).length

  return (
    /*
      Built the way a product card is: frameless, one studio plate, then type.
      The plate holds the package's own photograph when it has one, and the
      products it contains as a group shot when it does not — three tubs
      standing together on the same plate a single product gets.
    */
    <Link href={`/bundles/${bundle.slug}`} data-interactive className="sf-bcard">
      <span className="sf-bcard-plate">
        {bundle.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bundle.imageUrl} alt="" loading="lazy" className="sf-bcard-photo" />
        ) : (
          coreSlots.slice(0, 3).map((slot, i) => {
            const product = byId.get(slot.selectedProductId)
            return (
              <span key={slot.slotId} className="sf-bcard-item" data-pos={i}>
                <ProductTile
                  imageUrl={product?.imageUrl ?? null}
                  formats={product?.formats}
                  title=""
                  size={160}
                  fill
                  plate
                  style={{ background: 'transparent' }}
                />
              </span>
            )
          })
        )}
      </span>

      <span className="sf-pcard-text">
        <span className="sf-pcard-brand">{bundle.seriesName}</span>
        <span className="sf-name sf-clamp-2">{bundle.name}</span>
        {/* What the package IS: the stack and the sessions that come with it. */}
        <span className="sf-pcard-meta sf-tnum">
          {coreSlots.length} products
          {workoutCount > 0 && `, ${workoutCount} workout${workoutCount === 1 ? '' : 's'}`}
        </span>
        <span className="sf-pcard-price"><span className="sf-price">{formatGBP(price.price)}</span></span>
        <span className="sf-bcard-go">
          View session stack
          <Icon name="chevron-right" size={14} />
        </span>
      </span>
    </Link>
  )
}
