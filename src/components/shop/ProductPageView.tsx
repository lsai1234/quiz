'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { masterVariant } from '@/lib/catalogue/master'
import { pricePerServing, formatPerServing } from '@/lib/shop/per-serving'
import { track } from '@/lib/analytics/events'
import { useBasket } from '@/lib/basket/store'
import { ShopPageHeader } from './ShopPageHeader'
import { ShopFooter } from './ShopFooter'
import { MAX_LINE_QTY } from '@/lib/basket/helpers'
import { hasRating } from '@/lib/shop/ratings'
import { ProductTile } from '@/components/stack-review/ProductTile'
import { ProductDetailBody, VariantOptions, stockLine } from './ProductDetail'
import { StarRating } from './StarRating'
import { Button } from '@/components/storefront'
import { Icon } from '@/components/ui/Icon'

interface Props {
  product: CatalogueProduct
  /**
   * Every `productId:variantId` the catalogue still sells.
   *
   * The header's count has to count the lines the basket will actually CHARGE
   * for, not the raw persisted ones — see `resolvedItemCount` in
   * `basket/helpers`. The server sends down the keys rather than the products:
   * a few kilobytes of strings instead of the whole catalogue.
   */
  sellableKeys: string[]
}

/**
 * The product page.
 *
 * A spec sheet, not a brochure: the photograph on its studio plate (sticky
 * beside the words on a wide screen), then the name, the rating, the price
 * with what it saves and what a serving costs, the options as pills, one add
 * bar, and the facts in a ruled table. The supplier's description follows for
 * whoever wants to read on.
 *
 * The basket drawer is not here. It belongs to `ShopShell` and is wired to
 * that shell's pricing, codes and nudges; a second copy on this page would be
 * a second implementation of the most correctness-sensitive surface in the
 * app. The header's basket links to `/shop#basket`, which opens the real one.
 */
export function ProductPageView({ product, sellableKeys }: Props) {
  const add = useBasket((s) => s.add)
  const lines = useBasket((s) => s.lines)
  // Opens on the product's MASTER — the SKU chosen in the Hub — not on whichever
  // variant import happened to list first.
  const [variantId, setVariantId] = useState<string>(() => masterVariant(product)?.id ?? '')
  const [qty, setQty] = useState(1)
  const [justAdded, setJustAdded] = useState(false)

  const variant = product.variants.find((v) => v.id === variantId) ?? masterVariant(product)
  const price = variant?.price ?? product.basePrice
  const rrp = variant?.compareAtPrice ?? product.compareAtPrice
  const onDeal = rrp != null && rrp > price
  const soldOut = !variant?.available
  const perServ = variant ? pricePerServing(product, variant) : null
  const stock = stockLine(variant)
  const sellable = useMemo(() => new Set(sellableKeys), [sellableKeys])
  const count = lines.reduce((n, l) => (sellable.has(`${l.productId}:${l.variantId}`) ? n + l.quantity : n), 0)
  const inBasket = variant ? lines.find((l) => l.productId === product.id && l.variantId === variant.id)?.quantity ?? 0 : 0

  const handleAdd = () => {
    if (!variant || soldOut) return
    add(product.id, variant.id, qty)
    track('add_to_basket', { id: product.id, source: 'product_page', price, qty })
    setJustAdded(true)
    setTimeout(() => setJustAdded(false), 1300)
  }

  return (
    <main className="storefront sf-page min-h-dvh">
      <ShopPageHeader count={count} />

      <div className="sf-wrap sf-pdp">
        <nav className="sf-crumbs" aria-label="Breadcrumb">
          <Link href="/" data-interactive className="sf-crumbs-back">
            <Icon name="chevron-left" size={15} />
            Shop
          </Link>
          <span aria-hidden>/</span>
          <span>{product.category}</span>
        </nav>

        <div className="sf-pdp-media">
          <div className="sf-pdp-plate">
            <ProductTile
              // Follows the chosen variant: a flavour picker that changes the
              // price and not the picture is a page showing one photograph for
              // six different tubs.
              imageUrl={variant?.imageUrl ?? product.imageUrl}
              formats={product.formats}
              title={product.title}
              size={640}
              fill
              inset
              plate
            />
            {onDeal && rrp != null && (
              <span className="sf-pcard-off sf-num">−{Math.round((1 - price / rrp) * 100)}%</span>
            )}
          </div>
        </div>

        <div className="sf-pdp-info">
          <div>
            {product.brand && <p className="sf-label" style={{ margin: '0 0 var(--space-2)' }}>{product.brand}</p>}
            <h1 className="sf-pdp-title">{product.title}</h1>
            {hasRating(product.rating) && (
              <StarRating rating={product.rating} size={14} showAverage showCount color="var(--text)" className="mt-3.5" />
            )}
          </div>

          <div className="sf-pdp-price">
            <span className="sf-pdp-amount sf-num">{formatGBP(price)}</span>
            {onDeal && (
              <>
                <s className="sf-num">{formatGBP(rrp!)}</s>
                <span className="sf-pdp-save sf-num">Save {formatGBP(rrp! - price)}</span>
              </>
            )}
            {(perServ != null || stock || soldOut) && (
              <p className="sf-pdp-under sf-num">
                {perServ != null && `${formatPerServing(perServ)} a serving`}
                {perServ != null && (stock || soldOut) && ', '}
                {soldOut ? (product.restockingSoon ? 'Back in stock soon' : 'Sold out') : stock}
              </p>
            )}
          </div>

          <VariantOptions product={product} variant={variant} onSelectVariant={(id) => { setVariantId(id); setQty(1) }} />

          {/* The add bar. Fixed to the bottom on a phone, so a shopper who has
              read to the end does not have to scroll back; in place on a wide
              screen, where the whole column is in view. */}
          <div className="sf-pdp-buy">
            <div className="sf-pdp-buy-in">
              <div className="sf-pdp-qty" role="group" aria-label="Quantity">
                <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity" disabled={qty <= 1}>
                  <Icon name="dash" size={16} />
                </button>
                <span className="sf-num" aria-live="polite">{qty}</span>
                <button type="button" onClick={() => setQty((q) => Math.min(MAX_LINE_QTY, q + 1))} aria-label="Increase quantity">
                  <Icon name="plus" size={16} />
                </button>
              </div>
              {/* The one primary on the page. */}
              <Button variant="primary" size="lg" fullWidth onClick={handleAdd} disabled={soldOut} className="sf-pdp-add">
                <span className="sf-pdp-add-word">
                  {soldOut ? (product.restockingSoon ? 'Back in stock soon' : 'Sold out') : justAdded ? 'Added' : 'Add to basket'}
                </span>
                {!soldOut && <span className="sf-num">{formatGBP(price * qty)}</span>}
              </Button>
            </div>
            {inBasket > 0 && !justAdded && (
              <p className="sf-pdp-inbasket">
                <Icon name="check" size={14} />
                {inBasket} in your basket
                <Link href="/shop#basket" data-interactive>View basket</Link>
              </p>
            )}
          </div>

          <ProductDetailBody product={product} variant={variant} />
        </div>
      </div>

      <ShopFooter />
    </main>
  )
}
