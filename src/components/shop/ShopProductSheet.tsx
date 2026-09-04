'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { variantStock } from '@/lib/shop/merchandising'
import { categoryHue } from '@/lib/shop/category-visuals'
import { track } from '@/lib/analytics/events'
import { useBasket } from '@/lib/basket/store'
import { MAX_LINE_QTY } from '@/lib/basket/helpers'
import { hasRating } from '@/lib/shop/ratings'
import { IconButton } from '@/components/ui/IconButton'
import { ProductTile } from '@/components/stack-review/ProductTile'
import { ProductDetailBody, variantLabel } from './ProductDetail'
import { StarRating } from './StarRating'
import { StockChip } from './StockChip'

interface Props {
  product: CatalogueProduct
  /** Fired after the item is added — the shell closes the sheet and checks out. */
  onBuyNow?: () => void
  onClose: () => void
}

/**
 * The shop product detail sheet — the Act 4 sheet reworked for retail: no slot,
 * no swap/remove, but a variant picker, a quantity stepper and Add / Buy-now.
 * Built on the shared product helpers so it matches the quiz sheet's look.
 */
export function ShopProductSheet({ product, onBuyNow, onClose }: Props) {
  const add = useBasket((s) => s.add)
  const [mounted, setMounted] = useState(false)
  const [variantId, setVariantId] = useState<string>(
    () => (product.variants.find((v) => v.available) ?? product.variants[0])?.id ?? '',
  )
  const [qty, setQty] = useState(1)
  const [justAdded, setJustAdded] = useState(false)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Same category chip colour as the card that opened this sheet.
  const hue = categoryHue(product.category)
  const variant = product.variants.find((v) => v.id === variantId)
    ?? product.variants.find((v) => v.available)
    ?? product.variants[0]
  const price = variant?.price ?? product.basePrice
  const rrp = variant?.compareAtPrice ?? product.compareAtPrice
  const onDeal = rrp != null && rrp > price
  const soldOut = !variant?.available
  const stock = variant ? variantStock(variant) : { count: null, low: false }

  const doAdd = (source: 'sheet' | 'buy_now') => {
    if (!variant || soldOut) return false
    add(product.id, variant.id, qty)
    track('add_to_basket', { id: product.id, source, price, qty })
    return true
  }
  const handleAdd = () => {
    if (!doAdd('sheet')) return
    setJustAdded(true)
    setTimeout(() => setJustAdded(false), 1300)
  }
  const handleBuyNow = () => { if (doAdd('buy_now')) onBuyNow?.() }

  if (!mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ background: 'rgba(0,0,0,0.72)' }}
    >
      <div className="w-full max-w-lg rounded-t-3xl overflow-hidden flex flex-col" style={{ background: 'var(--color-surface)', maxHeight: '92dvh' }}>
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-[var(--color-border-2)]" />
        </div>

        {/* Hero */}
        <div className="px-5 pt-2 pb-4 flex items-start gap-4 flex-shrink-0 border-b border-[var(--color-border)]">
          <ProductTile imageUrl={product.imageUrl} slot={product.stackSlots[0]} title={product.title} size={92} />
          <div className="flex-1 min-w-0 pt-0.5">
            <span
              className="inline-block px-2 py-0.5 rounded-full label mb-1.5"
              style={{ color: hue, background: `color-mix(in srgb, ${hue} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${hue} 24%, transparent)` }}
            >
              {product.category}
            </span>
            <h3 className="text-lg font-black leading-tight" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>{product.title}</h3>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-base font-black" style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-display)' }}>{formatGBP(price)}</span>
              {onDeal && <span className="text-xs line-through" style={{ color: 'var(--color-muted)' }}>{formatGBP(rrp!)}</span>}
              {variant && <span className="text-xs truncate" style={{ color: 'var(--color-muted)' }}>· {variantLabel(variant)}</span>}
            </div>
            {hasRating(product.rating) && (
              <StarRating rating={product.rating} size={13} showAverage showCount className="mt-2" />
            )}
            {stock.low && stock.count != null && <StockChip count={stock.count} className="mt-2" />}
            {soldOut && product.restockingSoon && (
              <p className="text-[11px] font-semibold mt-2" style={{ color: 'var(--color-amber)' }}>Back in stock soon</p>
            )}
          </div>
          <IconButton icon="x" label="Close" size="sm" filled onClick={onClose} />
        </div>

        {/* Body — the same content as `/product/[handle]`, from one component. */}
        <div className="overflow-y-auto flex-1 px-5 py-5">
          <ProductDetailBody
            product={product}
            variant={variant}
            onSelectVariant={setVariantId}
            hue={hue}
          />
          {/*
            The quick view is a browse gesture; the page is the thing you can
            send someone. Offering the URL from inside the sheet is how a shopper
            gets from one to the other without having to guess that it exists.
          */}
          <Link
            href={`/product/${product.handle}`}
            className="inline-flex items-center gap-1.5 mt-6 text-xs font-bold"
            style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-display)' }}
          >
            Open full product page
            <span aria-hidden>→</span>
          </Link>
        </div>

        {/* Sticky footer: quantity + actions */}
        <div className="flex items-center gap-2.5 px-5 py-3.5 flex-shrink-0 pb-[max(0.9rem,env(safe-area-inset-bottom))]" style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
          <div className="flex items-center rounded-xl flex-shrink-0" style={{ border: '1px solid var(--color-border-2)' }}>
            <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-9 h-11 text-lg active:opacity-60" style={{ color: 'var(--color-text-2)' }} aria-label="Decrease quantity">–</button>
            <span className="w-6 text-center text-sm font-bold" style={{ fontFamily: 'var(--font-display)' }}>{qty}</span>
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
          <button
            onClick={handleBuyNow}
            disabled={soldOut}
            className="py-3 px-4 rounded-xl text-sm font-bold active:scale-95 transition-all disabled:opacity-40 flex-shrink-0"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)', border: '1px solid var(--color-border-2)' }}
          >
            Buy now
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
