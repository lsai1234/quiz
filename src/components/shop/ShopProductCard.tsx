'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { dealInfo } from '@/lib/shop/merchandising'
import { useBasket } from '@/lib/basket/store'
import { track } from '@/lib/analytics/events'
import { Button } from '@/components/storefront'
import { ProductTile } from '@/components/stack-review/ProductTile'

interface Props {
  product: CatalogueProduct
  /**
   * Fired on a plain click, for analytics only — it does NOT intercept the
   * navigation. The card is a link to `/product/[handle]` and always was; what
   * changed is that there is no longer a sheet to open instead.
   */
  onOpen?: (product: CatalogueProduct) => void
  /** Duel state. Absent means the card offers no compare control at all. */
  compareSelected?: boolean
  onToggleCompare?: (product: CatalogueProduct) => void
}

/**
 * A product on the shelf: image, title, price, Add.
 *
 * ── What came off it ────────────────────────────────────────────────────────
 * A category chip in one of twelve hues, a merchandising badge, a low-stock
 * chip, a star rating, a struck-through RRP, a discount pill and four animated
 * "best for" bars. Seven claims per card, twenty-odd cards a screen. The
 * category is said by the heading the card sits under; the rest is on the
 * product page, which is now a real route with room to read it.
 *
 * ── The image ───────────────────────────────────────────────────────────────
 * Flush to the card's edges, radius on the top two corners only, 1:1,
 * `object-fit: contain`, and no inset.
 *
 * The image area is white, and that is the source material rather than a
 * decorative plate. Supplier photography is cut-outs shot on white and
 * delivered as JPEG with no alpha, at every aspect ratio from 2:3 to 3:2.
 * `contain` on a transparent ground therefore does not remove the white
 * rectangle — it just lets it float at its own shape in the middle of the card,
 * different on every card, which is the ragged version of the same problem.
 *
 * Squaring it at ingest and letting it run flush to three edges is the version
 * that reads as deliberate: every card has an identical photo area, and the
 * white belongs to the photograph rather than to a frame we drew round it.
 *
 * ── The price is not accent-coloured ────────────────────────────────────────
 * It was, and so was the Add button, the section heading, the deal subtitle and
 * the basket bar. Accent on everything is accent on nothing. Price is `--text`
 * at weight 400 in mono: it is the most-scanned figure on the shelf, and what
 * it needs is to line up column to column, not to glow.
 */
export function ShopProductCard({ product, onOpen, compareSelected, onToggleCompare }: Props) {
  const add = useBasket((s) => s.add)
  const [justAdded, setJustAdded] = useState(false)
  const [reduced, setReduced] = useState(false)
  const addTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    return () => { if (addTimer.current) clearTimeout(addTimer.current) }
  }, [])

  const variant = product.variants.find((v) => v.available) ?? product.variants[0]
  const { price } = dealInfo(product)
  const soldOut = !variant?.available

  const handleAdd = () => {
    if (!variant || soldOut) return
    add(product.id, variant.id, 1)
    track('add_to_basket', { id: product.id, source: 'card', price })
    if (reduced) return
    setJustAdded(true)
    if (addTimer.current) clearTimeout(addTimer.current)
    addTimer.current = setTimeout(() => setJustAdded(false), 1300)
  }

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ background: 'var(--surface)', borderRadius: 'var(--r-card)' }}
    >
      <Link
        href={`/product/${product.handle}`}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
          onOpen?.(product)
        }}
        className="flex flex-col flex-1"
      >
        <ProductTile
          imageUrl={product.imageUrl}
          slot={product.stackSlots[0]}
          title={product.title}
          size={320}
          fill
          className="rounded-none"
          style={{ border: 'none', borderTopLeftRadius: 'var(--r-card)', borderTopRightRadius: 'var(--r-card)' }}
        />

        <div className="flex flex-col flex-1" style={{ padding: 'var(--space-5)', gap: 'var(--space-3)' }}>
          {/*
            Clamped by the line box, never by counting characters. A JS slice at
            N characters cuts mid-word and cannot know where the line actually
            broke; `-webkit-line-clamp` ends at whatever fits two lines.
          */}
          <p className="sf-body sf-clamp-2" style={{ color: 'var(--text)' }}>
            {product.title}
          </p>

          <p className="sf-num" style={{ color: 'var(--text)', fontSize: 'var(--body-size)', fontWeight: 'var(--weight-regular)', marginTop: 'auto' }}>
            {formatGBP(price)}
          </p>
        </div>
      </Link>

      <div className="flex flex-col" style={{ padding: '0 var(--space-5) var(--space-5)', gap: 'var(--space-2)' }}>
        <Button
          variant="secondary"
          size="sm"
          fullWidth
          onClick={handleAdd}
          disabled={soldOut}
          aria-label={soldOut ? undefined : `Add ${product.title} to basket`}
        >
          {soldOut ? (product.restockingSoon ? 'Back in stock soon' : 'Sold out') : justAdded ? 'Added' : 'Add'}
        </Button>

        {/*
          The one element on this card beyond image, title, price and Add, and
          it is here deliberately.

          The spec removed the compare control from the card image, and it is
          gone from there. But a duel is assembled by picking two products off a
          shelf, so with no entry point on the shelf the feature is dead code
          however much of it still compiles — and keeping the duel was an
          explicit instruction. A ghost button is the quietest thing that can
          still be found: no fill, dim text, and it only renders where a duel is
          actually on offer.
        */}
        {onToggleCompare && (
          <Button
            variant={compareSelected ? 'secondary' : 'ghost'}
            size="sm"
            fullWidth
            onClick={() => onToggleCompare(product)}
            aria-pressed={!!compareSelected}
            aria-label={compareSelected ? `Stop comparing ${product.title}` : `Compare ${product.title}`}
          >
            {compareSelected ? 'Comparing' : 'Compare'}
          </Button>
        )}
      </div>
    </div>
  )
}
