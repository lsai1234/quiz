'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { dealInfo, priceRange } from '@/lib/shop/merchandising'
import { pricePerServing, formatPerServing, servingsForVariant } from '@/lib/shop/per-serving'
import { servingsLabel } from '@/lib/catalogue/accessory'
import { hasRating } from '@/lib/shop/ratings'
import { useBasket } from '@/lib/basket/store'
import { MAX_LINE_QTY } from '@/lib/basket/helpers'
import { track } from '@/lib/analytics/events'
import { ProductTile } from '@/components/stack-review/ProductTile'
import { Icon } from '@/components/ui/Icon'

interface Props {
  product: CatalogueProduct
  /** Fired on a plain click, for analytics. It does not intercept navigation. */
  onOpen?: (product: CatalogueProduct) => void
  /** Show the per-serving price instead of the unit price. Shelf-wide toggle. */
  perServing?: boolean
  /** Duel selection. Only rendered while the shelf is in compare mode. */
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: (product: CatalogueProduct) => void
}

/**
 * A product on the shelf. No frame: the photograph and the type are the card.
 *
 * ── Why frameless ───────────────────────────────────────────────────────────
 * Twenty boxed cards a screen is twenty borders, twenty fills and twenty
 * shadows competing with the twenty products they hold. Taking the box away
 * leaves the photograph on its studio plate — the one surface on the shelf —
 * and lets the space between products do the separating. That room is most of
 * what makes a shelf look like it is worth the money.
 *
 * ── The scan order ──────────────────────────────────────────────────────────
 * Photograph, then the name, then the price; the size, servings and rating
 * underneath are what separate one tub from the one beside it. Brand first in
 * small type, because that is how a supplement shelf is actually scanned.
 *
 * ── One action, on the photograph ──────────────────────────────────────────
 * Add is a round button on the photo's corner. Once the product is in the
 * basket it becomes a cyan − n + stepper in the same place and the plate gets
 * a cyan ring, so the shelf shows at a glance what you have already picked.
 * The stepper is a sibling of the link, not inside it: an interactive element
 * may not sit inside an anchor.
 */
export function ShopProductCard({
  product, onOpen, perServing = false, selectable = false, selected = false, onToggleSelect,
}: Props) {
  const add = useBasket((s) => s.add)
  const setQty = useBasket((s) => s.setQty)
  const remove = useBasket((s) => s.remove)
  const lines = useBasket((s) => s.lines)
  const [justAdded, setJustAdded] = useState(false)
  const [reduced, setReduced] = useState(false)
  const addTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    return () => { if (addTimer.current) clearTimeout(addTimer.current) }
  }, [])

  const { price, rrp, onDeal } = dealInfo(product)
  /*
    "From £11.99" when the variants are genuinely different prices: the card
    prices, describes and adds the cheapest sellable variant, so a card that
    says "From £11.99" never drops a £20.04 bag in the basket.
  */
  const range = priceRange(product)
  const cheapest = [...product.variants]
    .filter((v) => v.available)
    .sort((a, b) => a.price - b.price)[0]
  const variant = (range.varies ? cheapest : undefined)
    ?? product.variants.find((v) => v.available)
    ?? product.variants[0]
  const soldOut = !variant?.available
  const headline = range.varies ? range.min : price
  const off = !range.varies && onDeal && rrp != null && rrp > 0 ? Math.round((1 - price / rrp) * 100) : 0

  const perServ = variant ? pricePerServing(product, variant) : null
  /* The servings of the VARIANT on the card, never the product's own number. */
  const servings = variant ? servingsForVariant(product, variant) : null
  const spec = [variant?.size, servings != null ? servingsLabel(servings) : null]
    .filter(Boolean)
    .join(', ')

  const inBasket = variant ? lines.find((l) => l.productId === product.id && l.variantId === variant.id)?.quantity ?? 0 : 0

  const handleAdd = () => {
    if (!variant || soldOut) return
    add(product.id, variant.id, 1)
    track('add_to_basket', { id: product.id, source: 'card', price })
    if (reduced) return
    setJustAdded(true)
    if (addTimer.current) clearTimeout(addTimer.current)
    addTimer.current = setTimeout(() => setJustAdded(false), 900)
  }

  const handleLess = () => {
    if (!variant) return
    if (inBasket <= 1) remove(product.id, variant.id)
    else setQty(product.id, variant.id, inBasket - 1)
  }

  return (
    <article className="sf-pcard" data-in={inBasket > 0} data-picked={selectable && selected}>
      <Link
        href={`/product/${product.handle}`}
        onClick={(e) => {
          if (selectable) { e.preventDefault(); onToggleSelect?.(product); return }
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
          onOpen?.(product)
        }}
        aria-pressed={selectable ? selected : undefined}
        data-interactive
        className="sf-pcard-link"
      >
        <span className={`sf-pcard-plate${justAdded ? ' sf-pcard-charged' : ''}`}>
          <ProductTile
            // The variant's own photograph when PowerBody sent one for its SKU.
            imageUrl={variant?.imageUrl ?? product.imageUrl}
            formats={product.formats}
            title={product.title}
            size={320}
            fill
            inset
            plate
          />
          {off > 0 && <span className="sf-pcard-off sf-num">−{off}%</span>}
          {selectable && (
            <span className="sf-pcard-pick" aria-hidden>
              <Icon name="check" size={14} />
            </span>
          )}
        </span>

        <span className="sf-pcard-text">
          {product.brand && <span className="sf-pcard-brand">{product.brand}</span>}
          <span className="sf-name sf-clamp-2">{product.title}</span>
          {spec && <span className="sf-pcard-meta sf-tnum">{spec}</span>}
          <span className="sf-pcard-price">
            {perServing && perServ != null ? (
              <>
                <span className="sf-price">{formatPerServing(perServ)}</span>
                <span className="sf-pcard-small">a serving</span>
              </>
            ) : (
              <>
                {range.varies && <span className="sf-pcard-small">From</span>}
                <span className="sf-price">{formatGBP(headline)}</span>
                {off > 0 && rrp != null && <s className="sf-pcard-small sf-tnum">{formatGBP(rrp)}</s>}
              </>
            )}
          </span>
          {hasRating(product.rating) && (
            <span className="sf-pcard-rate sf-tnum">
              <Icon name="star" size={12} />
              {product.rating.average.toFixed(1)}
              <span>({product.rating.count.toLocaleString()})</span>
            </span>
          )}
          {soldOut && <span className="sf-pcard-meta">{product.restockingSoon ? 'Back in stock soon' : 'Sold out'}</span>}
        </span>
      </Link>

      {!selectable && !soldOut && (
        <div className="sf-pcard-buy">
          {inBasket > 0 ? (
            <div className="sf-stepper" role="group" aria-label={`${product.title}, ${inBasket} in basket`}>
              <button type="button" onClick={handleLess} aria-label={inBasket === 1 ? `Remove ${product.title} from basket` : `One fewer ${product.title}`}>
                <Icon name="dash" size={15} />
              </button>
              <span className="sf-num" aria-live="polite">{inBasket}</span>
              <button type="button" onClick={handleAdd} disabled={inBasket >= MAX_LINE_QTY} aria-label={`One more ${product.title}`}>
                <Icon name="plus" size={15} />
              </button>
            </div>
          ) : (
            <button type="button" className="sf-addbtn" onClick={handleAdd} aria-label={`Add ${product.title} to basket`} data-interactive>
              <Icon name="plus" size={18} />
            </button>
          )}
        </div>
      )}
    </article>
  )
}
