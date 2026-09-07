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
import { track } from '@/lib/analytics/events'
import { ProductTile } from '@/components/stack-review/ProductTile'
import { StarRating } from './StarRating'

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
 * A product on the shelf.
 *
 * ── The scan order ──────────────────────────────────────────────────────────
 * A shop card is not a list row. A list row is read; a card is scanned, and
 * scanning needs a focal point and a fixed order underneath it. Here that is:
 * the photograph, then the price, then the name, then the detail that separates
 * this product from the one beside it.
 *
 * The version this replaces had the title and the price at the same size, the
 * same weight and the same colour, so nothing led and the card had to be read.
 * That is the difference between browsing and working.
 *
 * ── The information is the point ────────────────────────────────────────────
 * A card carrying only a name and a price cannot be chosen from: two creatines
 * at £18.99 and £29.99 and nothing on either explains the £11. So the card
 * carries the size, the servings, the rating and — the useful one — the price
 * per serving, which the shop already computes and never showed.
 *
 * This is not clutter. Clutter is unordered information; four facts on one grid
 * under one heading is a specification.
 *
 * ── One action, and it is not a button ──────────────────────────────────────
 * Two full-width grey buttons per card put eight identical grey rectangles on a
 * screen, which is what made the grid read as a form. The whole card is a link
 * to the product page; Add is a 36px circle that sits on the photograph's
 * bottom edge, where it is unmistakable and takes no vertical space.
 */
export function ShopProductCard({
  product, onOpen, perServing = false, selectable = false, selected = false, onToggleSelect,
}: Props) {
  const add = useBasket((s) => s.add)
  const [justAdded, setJustAdded] = useState(false)
  const [reduced, setReduced] = useState(false)
  const addTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    return () => { if (addTimer.current) clearTimeout(addTimer.current) }
  }, [])

  const { price, rrp, onDeal } = dealInfo(product)
  /*
    "From £11.99" when the variants are genuinely different prices.

    The card prices the default variant, which is right while the variants are
    flavours of one tub. It is not right when a master SKU holds two different
    things — the glycine sold both as 100 capsules and as 454g of powder — and
    a single number then quotes whichever happens to be in stock first.

    When they do differ the card follows its own number: the cheapest sellable
    variant is the one it prices, describes and adds. A card that says "From
    £11.99" and drops a £20.04 bag in the basket is worse than one that never
    said "from" at all.
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

  const perServ = variant ? pricePerServing(product, variant) : null
  /*
    The servings of the VARIANT on the card, never the product's own number.

    An accessory has none at all (`servingsForVariant` says so), which is what
    put "30 servings" under two shakers and "1 servings" under a third; and a
    product whose variants are different sizes has a different count per size,
    so the product-level figure is wrong about every variant but the first.
  */
  const servings = variant ? servingsForVariant(product, variant) : null
  const spec = [variant?.size, servings != null ? servingsLabel(servings) : null]
    .filter(Boolean)
    .join(' · ')

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!variant || soldOut) return
    add(product.id, variant.id, 1)
    track('add_to_basket', { id: product.id, source: 'card', price })
    if (reduced) return
    setJustAdded(true)
    if (addTimer.current) clearTimeout(addTimer.current)
    addTimer.current = setTimeout(() => setJustAdded(false), 1200)
  }

  return (
    <Link
      href={`/product/${product.handle}`}
      onClick={(e) => {
        if (selectable) { e.preventDefault(); onToggleSelect?.(product); return }
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
        onOpen?.(product)
      }}
      aria-pressed={selectable ? selected : undefined}
      data-interactive
      className="sf-card relative flex flex-col h-full overflow-hidden"
      style={{
        background: 'var(--surface)',
        borderRadius: 'var(--r-card)',
        outline: selectable && selected ? '2px solid var(--accent)' : 'none',
        outlineOffset: -2 }}
    >
      <div className={`relative ${justAdded ? 'sf-added' : ''}`}>
        <ProductTile
          // The variant's own photograph when PowerBody sent one for its SKU —
          // every flavour is a separate product at their end, so the pictures
          // are per-flavour and the card used to show one of them for all.
          imageUrl={variant?.imageUrl ?? product.imageUrl}
          slot={product.stackSlots[0]}
          title={product.title}
          size={320}
          fill
          inset
          style={{ borderTopLeftRadius: 'var(--r-card)', borderTopRightRadius: 'var(--r-card)' }}
        />

        {/*
          Add, on the photograph's bottom edge. Half over the image and half
          over the text block, so it reads as attached to the product rather
          than as a row of controls at the bottom of a form — and it costs the
          card no height at all.
        */}
        {!selectable && (
          <button
            onClick={handleAdd}
            disabled={soldOut}
            data-interactive
            aria-label={soldOut ? `${product.title} is sold out` : `Add ${product.title} to basket`}
            className="sf-add absolute flex items-center justify-center"
            style={{
              right: 'var(--space-3)',
              bottom: -18,
              width: 36,
              height: 36,
              borderRadius: 'var(--r-pill)',
              border: 'none',
              background: justAdded ? 'var(--accent)' : 'var(--surface-hi)',
              color: justAdded ? 'var(--accent-ink)' : 'var(--text)',
              opacity: soldOut ? 0.4 : 1,
              pointerEvents: soldOut ? 'none' : undefined }}
          >
            {justAdded ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
            )}
          </button>
        )}
      </div>

      <div className="flex flex-col flex-1" style={{ padding: 'var(--space-3)', gap: 2 }}>
        {/*
          Brand first. It is how a supplement shelf is actually scanned — the
          manufacturer, then the product — and without it every card in a
          category opens with the same three words. PowerBody has always sent
          it; the catalogue used to throw it away.
        */}
        {product.brand && <p className="sf-label" style={{ paddingRight: 40 }}>{product.brand}</p>}

        {/* Then the price. It is the first NUMBER anyone looks for. */}
        <p className="flex items-baseline" style={{ gap: 'var(--space-2)', paddingRight: 40 }}>
          <span className="sf-price">
            {range.varies && <span className="sf-meta">From </span>}
            {formatGBP(headline)}
          </span>
          {!range.varies && onDeal && rrp != null && <span className="sf-meta sf-tnum line-through">{formatGBP(rrp)}</span>}
        </p>

        <p className="sf-name sf-clamp-2" style={{ marginTop: 2 }}>{product.title}</p>

        {spec && <p className="sf-meta sf-tnum">{spec}</p>}

        {perServing && perServ != null ? (
          <p className="sf-meta sf-tnum">{formatPerServing(perServ)} per serving</p>
        ) : hasRating(product.rating) ? (
          <StarRating rating={product.rating} size={11} showCount className="mt-0.5" />
        ) : null}

        {soldOut && (
          <p className="sf-meta" style={{ marginTop: 'auto', paddingTop: 'var(--space-2)' }}>
            {product.restockingSoon ? 'Back in stock soon' : 'Sold out'}
          </p>
        )}
      </div>
    </Link>
  )
}
