'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { slotVisual } from '@/lib/catalogue/slot-visuals'
import { productFacts, productDietary } from '@/lib/product-facts'
import { productBars, goalAxis } from '@/lib/stack-stats'
import { useBasket } from '@/lib/basket/store'
import { MAX_LINE_QTY } from '@/lib/basket/helpers'
import { hasRating } from '@/lib/shop/ratings'
import { QuizIcon } from '@/components/quiz/QuizIcon'
import { ProductTile } from '@/components/stack-review/ProductTile'
import { StatBars } from '@/components/stack-review/StatBars'
import { StarRating } from './StarRating'

const ACCENT = '#00D4FF'

interface Props {
  product: CatalogueProduct
  /** Fired after the item is added — the shell closes the sheet and checks out. */
  onBuyNow?: () => void
  onClose: () => void
}

function variantLabel(v: { title: string; flavour: string | null; size: string | null }): string {
  const parts = [v.flavour, v.size].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : v.title
}

function Fact({ glyph, label, value, hue }: { glyph: string; label: string; value: string; hue: string }) {
  return (
    <div className="flex-1 min-w-0 rounded-xl p-3" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
      <span style={{ color: hue }}><QuizIcon name={glyph} size={18} /></span>
      <p className="text-[9px] font-bold tracking-widest uppercase mt-2" style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-display)' }}>{label}</p>
      <p className="text-xs font-semibold mt-0.5 leading-snug" style={{ color: 'var(--color-text)' }}>{value}</p>
    </div>
  )
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

  const hue = slotVisual(product.stackSlots[0]).hue
  const variant = product.variants.find((v) => v.id === variantId)
    ?? product.variants.find((v) => v.available)
    ?? product.variants[0]
  const price = variant?.price ?? product.basePrice
  const rrp = variant?.compareAtPrice ?? product.compareAtPrice
  const onDeal = rrp != null && rrp > price
  const soldOut = !variant?.available
  const showVariantPicker = product.variants.length > 1

  const facts = productFacts(product)
  const dietary = productDietary(product)
  const bars = productBars(product, product.goals.slice(0, 4).map(goalAxis))

  const doAdd = () => {
    if (!variant || soldOut) return false
    add(product.id, variant.id, qty)
    return true
  }
  const handleAdd = () => {
    if (!doAdd()) return
    setJustAdded(true)
    setTimeout(() => setJustAdded(false), 1300)
  }
  const handleBuyNow = () => { if (doAdd()) onBuyNow?.() }

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
              className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold tracking-widest uppercase mb-1.5"
              style={{ color: hue, background: `color-mix(in srgb, ${hue} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${hue} 24%, transparent)`, fontFamily: 'var(--font-display)' }}
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
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-muted)] bg-[var(--color-surface-2)] active:scale-90 transition-all flex-shrink-0" aria-label="Close">✕</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-5 space-y-6">
          <section>
            <p className="text-[10px] font-bold tracking-widest uppercase mb-2" style={{ color: hue, fontFamily: 'var(--font-display)' }}>What it is</p>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-2)' }}>{product.description}</p>
          </section>

          {bars.length > 0 && (
            <StatBars bars={bars} animate={false} label="Best for" />
          )}

          {facts.length > 0 && (
            <section>
              <p className="text-[10px] font-bold tracking-widest uppercase mb-2.5" style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-display)' }}>The facts</p>
              <div className="flex gap-2.5">
                {facts.map((f) => <Fact key={f.key} glyph={f.glyph} label={f.label} value={f.value} hue={hue} />)}
              </div>
              {dietary.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {dietary.map((label) => (
                    <span key={label} className="px-2.5 py-1 rounded-full text-[10px] font-semibold" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border-2)', color: 'var(--color-text-2)' }}>{label}</span>
                  ))}
                </div>
              )}
            </section>
          )}

          {showVariantPicker && (
            <section>
              <p className="text-[10px] font-bold tracking-widest uppercase mb-2.5" style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-display)' }}>Flavour &amp; size</p>
              <div className="flex flex-col gap-1.5">
                {product.variants.map((v) => {
                  const isSelected = v.id === variant?.id
                  return (
                    <button
                      key={v.id}
                      onClick={() => { if (v.available) setVariantId(v.id) }}
                      disabled={!v.available}
                      className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-left transition-all active:scale-[0.98]"
                      style={{
                        background: isSelected ? `color-mix(in srgb, ${ACCENT} 12%, transparent)` : 'var(--color-surface-2)',
                        border: isSelected ? `1px solid color-mix(in srgb, ${ACCENT} 35%, transparent)` : '1px solid var(--color-border)',
                        opacity: v.available ? 1 : 0.4, cursor: v.available ? 'pointer' : 'not-allowed',
                      }}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-3.5 h-3.5 rounded-full flex-shrink-0 flex items-center justify-center" style={{ background: isSelected ? ACCENT : 'transparent', border: isSelected ? 'none' : '1.5px solid var(--color-border-2)' }}>
                          {isSelected && <svg width="7" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="#0A0A0A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </div>
                        <span className="text-sm font-medium" style={{ color: isSelected ? 'var(--color-text)' : 'var(--color-text-2)' }}>{variantLabel(v)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {!v.available && <span className="text-[9px]" style={{ color: 'var(--color-muted)' }}>Sold out</span>}
                        <span className="text-sm font-bold" style={{ color: isSelected ? ACCENT : 'var(--color-muted)' }}>{formatGBP(v.price)}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          {product.warnings.length > 0 && (
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--color-muted)' }}>{product.warnings.join(' · ')}</p>
          )}
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
            {soldOut ? 'Sold out' : justAdded ? 'Added ✓' : 'Add to basket'}
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
