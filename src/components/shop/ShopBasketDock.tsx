'use client'

import type { ResolvedBasketLine } from '@/lib/basket/types'
import { formatGBP, getPricingConfig, qualifiesForFreeDelivery } from '@/lib/stack-blueprint/pricing'
import { ProductTile } from '@/components/stack-review/ProductTile'
import { Button } from '@/components/storefront'

interface Props {
  lines: ResolvedBasketLine[]
  count: number
  subtotal: number
  onOpen: () => void
  /** False while a delivery suggestion above the dock is already saying it. */
  showDelivery?: boolean
}

/**
 * The basket, docked at the bottom of the shop while it has something in it.
 *
 * A floating glass bar rather than a full-width slab: the last few things you
 * added as small photographs, the total, how far you are from free delivery,
 * and the one primary action on the shelf — View basket. A thin cyan line along
 * its foot fills towards the free-delivery threshold.
 *
 * The delivery figure is the same rule the drawer and `/api/cart` use
 * (`qualifiesForFreeDelivery`), so the three cannot disagree. It is a fact, not
 * a nudge: no "only £3 more!", just how far it is.
 */
export function ShopBasketDock({ lines, count, subtotal, onOpen, showDelivery = true }: Props) {
  const config = getPricingConfig()
  const threshold = config.freeDeliveryThreshold
  const free = qualifiesForFreeDelivery(subtotal, config)
  const remaining = Math.max(0, Math.round((threshold - subtotal) * 100) / 100)
  const filled = threshold > 0 ? Math.min(1, subtotal / threshold) : 1
  const recent = lines.slice(-3)

  return (
    <div className="sf-dock">
      <div className="sf-dock-thumbs" aria-hidden>
        {recent.map((l) => (
          <span key={`${l.product.id}:${l.variant.id}`} className="sf-dock-thumb">
            <ProductTile imageUrl={l.variant.imageUrl ?? l.product.imageUrl} formats={l.product.formats} title="" size={96} fill plate />
          </span>
        ))}
      </div>
      <div className="sf-dock-words">
        <b className="sf-num">{formatGBP(subtotal)}</b>
        <small>
          {count} item{count !== 1 ? 's' : ''}
          {showDelivery && threshold > 0 && (free ? ', free UK delivery' : `, ${formatGBP(remaining)} to free delivery`)}
        </small>
      </div>
      <Button variant="primary" size="md" onClick={onOpen} aria-label={`View basket, ${count} item${count !== 1 ? 's' : ''}, ${formatGBP(subtotal)}`}>
        View basket
      </Button>
      {threshold > 0 && (
        <span className="sf-dock-line" aria-hidden>
          <i style={{ transform: `scaleX(${filled})` }} />
        </span>
      )}
    </div>
  )
}
