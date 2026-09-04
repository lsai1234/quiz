'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { dealInfo } from '@/lib/shop/merchandising'
import { categoryHue } from '@/lib/shop/category-visuals'
import { useBasket } from '@/lib/basket/store'
import { hasRating } from '@/lib/shop/ratings'
import { track } from '@/lib/analytics/events'
import { Card, Button } from '@/components/system'
import { ProductTile } from '@/components/stack-review/ProductTile'
import { StarRating } from './StarRating'

interface Props {
  product: CatalogueProduct
  /**
   * Open the quick-view sheet. When given, the card's link is intercepted and
   * the sheet opens instead — the browse gesture. The href is still real, so
   * cmd-click, middle-click, "copy link" and a crawler all reach the page.
   */
  onExpand?: (product: CatalogueProduct) => void
  /**
   * Compare state. Absent means the card shows no compare affordance at all —
   * the results grid and the empty state's "closest we stock" both pass nothing,
   * because a duel is a shelf-browsing gesture.
   */
  compareSelected?: boolean
  onToggleCompare?: (product: CatalogueProduct) => void
}

/**
 * A product on the shelf: the photo, the name, the price.
 *
 * ── What this card used to carry, and why it doesn't ─────────────────────────
 * A merchandising badge, a low-stock chip, a one-line reason, four animated
 * "best for" bars and a discount pill over the image — five competing claims per
 * card, twenty-odd cards a screen. Every one of them was defensible on its own
 * and together they made the shelf unreadable: the eye had nowhere to rest, and
 * the three things a shopper is actually choosing between were the smallest
 * elements on the card.
 *
 * So the card answers three questions and stops. What is it (photo, name), what
 * does it cost (price, and the struck RRP when it is down), and can I have it
 * (Add). The bars, the facts, the stock count and the variants all still exist —
 * one tap away, in the sheet and on the product page, where there is room to
 * read them.
 *
 * Two things survived the cull and it is worth saying why. The category chip is
 * a classification, not a claim, and search results are mixed-category — without
 * it a grid of twelve tubs has no structure. The price it is REDUCED FROM is a
 * fact about the price and belongs next to it; the `-25%` pill that used to sit
 * over the photo was the same fact said twice, so that one went.
 *
 * ── Why the Add button stayed ────────────────────────────────────────────────
 * A card that is nothing but a link is the cleaner object, and on a desktop
 * catalogue it would be right. This shop is a phone shop whose basket, bundle
 * nudges and free-delivery line are all built around adding from the shelf, and
 * routing every add through a sheet adds a tap to the only action that matters.
 * It is one button, in its own row, below a divider — it does not compete with
 * the photo. The trade is noted rather than hidden.
 */
export function ShopProductCard({ product, onExpand, compareSelected, onToggleCompare }: Props) {
  const add = useBasket((s) => s.add)
  const [justAdded, setJustAdded] = useState(false)
  const [reduced, setReduced] = useState(false)
  const addTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    return () => { if (addTimer.current) clearTimeout(addTimer.current) }
  }, [])

  // Colour-coded by category, so every card in a section carries the same chip.
  const hue = categoryHue(product.category)
  const variant = product.variants.find((v) => v.available) ?? product.variants[0]
  const { price, rrp, onDeal } = dealInfo(product)
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
    /*
      The system's Card, not a hand-rolled bordered box.
      
      What that buys, and what the hairline-bordered div it replaces could not:
      a translucent surface that lets the ground's blooms show through, the
      specular band along the top edge that makes a plane read as a sheet
      catching light rather than a lighter rectangle, and a real shadow so the
      card sits ON the page instead of being drawn on it. `padding="none"`
      because the photo goes to the edge and the caller owns the inset — the one
      exception DESIGN.md names to the specular invariant.
    */
    <Card elevation={1} padding="none" className="relative flex flex-col overflow-hidden h-full">
      <Link
        href={`/product/${product.handle}`}
        onClick={(e) => {
          if (!onExpand) return
          // Leave the modified clicks alone — those are the ones asking for the
          // URL rather than the quick view.
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
          e.preventDefault()
          onExpand(product)
        }}
        className="flex flex-col flex-1 active:opacity-90 transition-opacity"
      >
        {/*
          The photo as an inset plate, not a full-bleed square.

          Supplier cut-outs are baked onto white, so the plate has to be white or
          the seam shows. Run edge to edge and that white square IS the card —
          four of them tile the screen and the product is the smallest thing on
          its own shelf. Inset by the card's own padding and rounded, the dark
          surface frames each photo, the cards read as objects holding pictures,
          and the eye goes to the product rather than to the rectangle.
        */}
        <div className="p-2.5 pb-0">
          <ProductTile
            imageUrl={product.imageUrl}
            slot={product.stackSlots[0]}
            title={product.title}
            size={320}
            fill
            pad
          />
        </div>

        <div className="p-3 flex flex-col gap-1.5 flex-1">
          <span
            className="self-start px-2 py-0.5 rounded-full label"
            style={{
              color: hue,
              background: `color-mix(in srgb, ${hue} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${hue} 24%, transparent)`,
            }}
          >
            {product.category}
          </span>

          <p className="text-sm font-bold leading-snug line-clamp-2" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
            {product.title}
          </p>

          {hasRating(product.rating) && <StarRating rating={product.rating} size={11} />}

          <span className="flex items-baseline gap-1.5 mt-auto pt-1">
            <span className="text-base font-black tabular-nums" style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-display)' }}>
              {formatGBP(price)}
            </span>
            {onDeal && (
              <span className="text-[11px] line-through tabular-nums" style={{ color: 'var(--color-muted)' }}>{formatGBP(rrp!)}</span>
            )}
          </span>
        </div>
      </Link>

      {/*
        The action row: Add, and — where a duel is on offer — Compare beside it.

        Compare was an unlabelled 13px glyph in the corner of the photo. Two
        problems, and the second only appeared once the first was fixed: nobody
        who had not been told what the glyph was could find out by looking, and
        giving it the word put a high-contrast pill on top of the product on
        every card. So it says the word, and it says it down here on the dark
        ground where a control belongs, off the photograph.

        Stacked, not side by side: at two columns a card is about 166px wide,
        and "Compare" as a word simply does not fit next to "Add" — laid out in
        a row it came out WIDER than the primary action, which inverts the one
        hierarchy the card has. Underneath, at label size and in the muted ink,
        it is available without being offered.
      */}
      <div className="p-2.5 flex flex-col gap-1.5" style={{ borderTop: '1px solid var(--color-border)' }}>
        {/*
          `secondary`, not `primary`. The system reserves the filled gradient for
          the one action a screen is FOR, and a shelf's is "go to the basket",
          which lives in the bar at the bottom. Four primaries in a viewport
          stops meaning "press this" and starts meaning "cyan".
        */}
        <Button
          variant="secondary"
          size="md"
          fullWidth
          onClick={handleAdd}
          disabled={soldOut}
          aria-label={soldOut ? undefined : `Add ${product.title} to basket`}
        >
          {soldOut ? (product.restockingSoon ? 'Back in stock soon' : 'Sold out') : justAdded ? 'Added' : 'Add'}
        </Button>

        {onToggleCompare && (
          <button
            onClick={() => onToggleCompare(product)}
            aria-pressed={!!compareSelected}
            aria-label={compareSelected ? `Stop comparing ${product.title}` : `Compare ${product.title}`}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg label active:scale-95 transition-all"
            style={{
              color: compareSelected ? 'var(--color-bg)' : 'var(--color-muted)',
              background: compareSelected ? 'var(--color-accent)' : 'transparent',
              border: `1px solid ${compareSelected ? 'transparent' : 'var(--color-border-2)'}`,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {compareSelected
                ? <path d="M20 6 9 17l-5-5" />
                : <><rect x="3" y="4" width="7" height="16" rx="1.5" /><rect x="14" y="4" width="7" height="16" rx="1.5" /></>}
            </svg>
            {compareSelected ? 'Comparing' : 'Compare'}
          </button>
        )}
      </div>
    </Card>
  )
}
