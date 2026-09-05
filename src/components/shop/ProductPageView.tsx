'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { variantStock } from '@/lib/shop/merchandising'
import { track } from '@/lib/analytics/events'
import { useBasket } from '@/lib/basket/store'
import { ShopPageHeader } from './ShopPageHeader'
import { MAX_LINE_QTY } from '@/lib/basket/helpers'
import { hasRating } from '@/lib/shop/ratings'
import { CHRGDLogo } from '@/components/brand/CHRGDLogo'
import { ProductTile } from '@/components/stack-review/ProductTile'
import { ProductDetailBody, variantLabel } from './ProductDetail'
import { StarRating } from './StarRating'
import { Button } from '@/components/storefront'

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
    <main className="storefront min-h-dvh" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <ShopPageHeader count={count} />

      <div className="max-w-lg mx-auto" style={{ padding: '0 var(--space-4)', paddingBottom: 120 }}>
        <Link
          href="/shop"
          data-interactive
          className="sf-meta inline-flex items-center"
          style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M19 12H5M11 18l-6-6 6-6" />
          </svg>
          Back to the shop
        </Link>

        {/* Full width, flush, on the page's own ground. */}
        <ProductTile
          imageUrl={product.imageUrl}
          slot={product.stackSlots[0]}
          title={product.title}
          size={640}
          fill
          className="mb-5"
        />

        {product.brand && <p className="sf-label" style={{ marginBottom: 'var(--space-2)' }}>{product.brand}</p>}
        <h1 className="sf-display" style={{ color: 'var(--text)' }}>{product.title}</h1>

        <div className="flex items-baseline flex-wrap" style={{ gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
          <span className="sf-display sf-tnum" style={{ color: 'var(--text)', fontSize: 26 }}>{formatGBP(price)}</span>
          {onDeal && <span className="sf-meta sf-tnum line-through">{formatGBP(rrp!)}</span>}
        </div>
        {variant && <p className="sf-meta" style={{ marginTop: 'var(--space-1)' }}>{variantLabel(variant)}</p>}

        {hasRating(product.rating) && <StarRating rating={product.rating} size={14} showAverage showCount className="mt-2.5" />}
        {/*
          Stock as one line of meta, and only when it is genuinely nearly gone.
          The amber chip this replaces appeared at every "low" threshold and on
          the grid as well, which is the shape of a scarcity badge whether or
          not the number behind it is true.
        */}
        {stock.count != null && stock.count < 5 && (
          <p className="sf-meta" style={{ marginTop: 'var(--space-3)' }}>
            Only <span className="sf-num">{stock.count}</span> left
          </p>
        )}
        {soldOut && (
          <p className="sf-meta" style={{ marginTop: 'var(--space-3)' }}>
            {product.restockingSoon ? 'Back in stock soon' : 'Sold out'}
          </p>
        )}

        <ProductDetailBody
          product={product}
          variant={variant}
          onSelectVariant={setVariantId}
          className="mt-7"
        />
      </div>

      {/* The add bar. Fixed rather than in flow: the description runs long, and
          a shopper who has read to the bottom should not have to scroll back. */}
      <div
        className="fixed bottom-0 inset-x-0 z-40"
        style={{
          padding: 'var(--space-3) var(--space-4) max(var(--space-3), env(safe-area-inset-bottom))',
          borderTop: '1px solid var(--line)',
          background: 'var(--bg)' }}
      >
        <div className="max-w-lg mx-auto flex items-center gap-2.5">
          <div className="flex items-center flex-shrink-0" style={{ background: 'var(--surface-hi)', borderRadius: 'var(--r-control)' }}>
            <Button variant="ghost" size="lg" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity">−</Button>
            <span className="sf-num text-center" style={{ width: 24, color: 'var(--text)' }}>{qty}</span>
            <Button variant="ghost" size="lg" onClick={() => setQty((q) => Math.min(MAX_LINE_QTY, q + 1))} aria-label="Increase quantity">+</Button>
          </div>
          {/* The one primary on the page. */}
          <Button variant="primary" size="lg" fullWidth onClick={handleAdd} disabled={soldOut}>
            {soldOut ? (product.restockingSoon ? 'Back in stock soon' : 'Sold out') : justAdded ? 'Added' : 'Add to basket'}
          </Button>
        </div>
      </div>
    </main>
  )
}
