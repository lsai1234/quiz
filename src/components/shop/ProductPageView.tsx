'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { variantStock } from '@/lib/shop/merchandising'
import { categoryHue } from '@/lib/shop/category-visuals'
import { track } from '@/lib/analytics/events'
import { useBasket } from '@/lib/basket/store'
import { MAX_LINE_QTY } from '@/lib/basket/helpers'
import { hasRating } from '@/lib/shop/ratings'
import { CHRGDLogo } from '@/components/brand/CHRGDLogo'
import { ProductTile } from '@/components/stack-review/ProductTile'
import { ProductDetailBody, variantLabel } from './ProductDetail'
import { StarRating } from './StarRating'
import { StockChip } from './StockChip'

interface Props {
  product: CatalogueProduct
  /**
   * Every `productId:variantId` the catalogue still sells.
   *
   * The badge has to count the lines the basket will actually CHARGE for, not
   * the raw persisted ones — see `resolvedItemCount` in `basket/helpers` for
   * what showing "2 · £0.00" cost. Resolving needs the catalogue, which this
   * page has server-side and the shop's client store does not reach here, so
   * the server sends down the keys rather than the products: a few kilobytes of
   * strings instead of the whole catalogue, for the one question being asked.
   */
  sellableKeys: string[]
}

/**
 * The product page.
 *
 * Same content as the quick-view sheet — `ProductDetailBody` is shared — with
 * the chrome a route needs instead of the chrome a modal needs: a way back to
 * the shop, a real heading, and an add bar that stays put.
 *
 * The basket drawer is not here. It belongs to `ShopShell` and is wired to that
 * shell's pricing, codes and nudges; a second copy on this page would be a
 * second implementation of the most correctness-sensitive surface in the app.
 * The header's basket links to `/shop#basket`, which opens the real one.
 */
export function ProductPageView({ product, sellableKeys }: Props) {
  const add = useBasket((s) => s.add)
  const lines = useBasket((s) => s.lines)
  const [variantId, setVariantId] = useState<string>(
    () => (product.variants.find((v) => v.available) ?? product.variants[0])?.id ?? '',
  )
  const [qty, setQty] = useState(1)
  const [justAdded, setJustAdded] = useState(false)

  const hue = categoryHue(product.category)
  const variant = product.variants.find((v) => v.id === variantId)
    ?? product.variants.find((v) => v.available)
    ?? product.variants[0]
  const price = variant?.price ?? product.basePrice
  const rrp = variant?.compareAtPrice ?? product.compareAtPrice
  const onDeal = rrp != null && rrp > price
  const soldOut = !variant?.available
  const stock = variant ? variantStock(variant) : { count: null, low: false }
  const sellable = useMemo(() => new Set(sellableKeys), [sellableKeys])
  const count = lines.reduce((n, l) => (sellable.has(`${l.productId}:${l.variantId}`) ? n + l.quantity : n), 0)

  const handleAdd = () => {
    if (!variant || soldOut) return
    add(product.id, variant.id, qty)
    track('add_to_basket', { id: product.id, source: 'product_page', price, qty })
    setJustAdded(true)
    setTimeout(() => setJustAdded(false), 1300)
  }

  return (
    <main className="min-h-dvh" style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}>
      <header className="px-5 pt-6 pb-2 max-w-lg mx-auto flex items-center justify-between">
        <Link href="/" aria-label="getCHRGD home" className="active:scale-95 transition-transform">
          <CHRGDLogo markSize={22} wordClassName="text-lg" />
        </Link>
        <Link
          href="/shop#basket"
          className="relative w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-transform"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-2)' }}
          aria-label={`Open basket, ${count} item${count !== 1 ? 's' : ''}`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text)' }} aria-hidden>
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
            <path d="M3 6h18M16 10a4 4 0 0 1-8 0" />
          </svg>
          {count > 0 && (
            <span
              className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-black tabular-nums"
              style={{ background: 'var(--color-accent)', color: 'var(--color-bg)', fontFamily: 'var(--font-display)' }}
            >
              {count}
            </span>
          )}
        </Link>
      </header>

      <div className="px-5 max-w-lg mx-auto pb-32">
        <Link
          href="/shop"
          className="inline-flex items-center gap-1.5 mt-2 mb-4 text-xs font-bold"
          style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-display)' }}
        >
          <span aria-hidden>←</span>
          Back to the shop
        </Link>

        {/* Hero. Image-forward, because a product page is the one place with the
            room to show the thing you are buying at a size worth showing —
            capped, because a full-width square on a phone is 390px of tub, and
            for a product the supplier sent no photo for it is 390px of nothing. */}
        <ProductTile
          imageUrl={product.imageUrl}
          slot={product.stackSlots[0]}
          title={product.title}
          size={320}
          fill
          className="mb-5 max-w-[300px] mx-auto"
        />

        <span
          className="inline-block px-2 py-0.5 rounded-full label mb-2"
          style={{ color: hue, background: `color-mix(in srgb, ${hue} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${hue} 24%, transparent)` }}
        >
          {product.category}
        </span>
        <h1 className="type-display" style={{ color: 'var(--color-text)' }}>{product.title}</h1>

        <div className="flex items-baseline gap-2 mt-2 flex-wrap">
          <span className="text-xl font-black tabular-nums" style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-display)' }}>{formatGBP(price)}</span>
          {onDeal && <span className="text-sm line-through tabular-nums" style={{ color: 'var(--color-muted)' }}>{formatGBP(rrp!)}</span>}
          {variant && <span className="text-sm" style={{ color: 'var(--color-muted)' }}>· {variantLabel(variant)}</span>}
        </div>

        {hasRating(product.rating) && <StarRating rating={product.rating} size={14} showAverage showCount className="mt-2.5" />}
        {stock.low && stock.count != null && <StockChip count={stock.count} className="mt-2.5" />}
        {soldOut && product.restockingSoon && (
          <p className="text-[11px] font-semibold mt-2.5" style={{ color: 'var(--color-amber)' }}>Back in stock soon</p>
        )}

        <ProductDetailBody
          product={product}
          variant={variant}
          onSelectVariant={setVariantId}
          hue={hue}
          className="mt-7"
        />
      </div>

      {/* The add bar. Fixed rather than in flow: the description runs long, and
          a shopper who has read to the bottom should not have to scroll back. */}
      <div
        className="fixed bottom-0 inset-x-0 z-40 px-5 py-3.5 pb-[max(0.9rem,env(safe-area-inset-bottom))]"
        style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
      >
        <div className="max-w-lg mx-auto flex items-center gap-2.5">
          <div className="flex items-center rounded-xl flex-shrink-0" style={{ border: '1px solid var(--color-border-2)' }}>
            <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-9 h-11 text-lg active:opacity-60" style={{ color: 'var(--color-text-2)' }} aria-label="Decrease quantity">–</button>
            <span className="w-6 text-center text-sm font-bold tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>{qty}</span>
            <button onClick={() => setQty((q) => Math.min(MAX_LINE_QTY, q + 1))} className="w-9 h-11 text-lg active:opacity-60" style={{ color: 'var(--color-text-2)' }} aria-label="Increase quantity">+</button>
          </div>
          <button
            onClick={handleAdd}
            disabled={soldOut}
            className="flex-1 py-3 rounded-xl text-sm font-bold active:scale-95 transition-all disabled:opacity-40"
            style={{
              fontFamily: 'var(--font-display)',
              background: justAdded ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)' : 'var(--color-accent)',
              color: justAdded ? 'var(--color-accent)' : 'var(--color-bg)',
              border: justAdded ? '1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)' : '1px solid transparent',
            }}
          >
            {soldOut ? (product.restockingSoon ? 'Back in stock soon' : 'Sold out') : justAdded ? 'Added' : 'Add to basket'}
          </button>
        </div>
      </div>
    </main>
  )
}
