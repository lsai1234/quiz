'use client'

import Link from 'next/link'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { formatGBP, PRICING_CONFIG } from '@/lib/stack-blueprint/pricing'
import { variantStock } from '@/lib/shop/merchandising'
import { productFacts, productDietary } from '@/lib/product-facts'
import { productBars, goalAxis } from '@/lib/stack-stats'
import { QuizIcon } from '@/components/quiz/QuizIcon'
import { CHRGDBolt } from '@/components/brand/CHRGDLogo'
import { StatBars } from '@/components/stack-review/StatBars'

const ACCENT = '#00D4FF'

/**
 * Everything a shopper can read about one product, without the chrome around it.
 *
 * Extracted so the quick-view sheet and the `/product/[handle]` page are the
 * same content and cannot drift — the page is not a second, thinner description
 * of the same tub. The two callers differ only in what wraps this: a modal with
 * a sticky footer, or a route with a header and a URL you can send someone.
 */

export function variantLabel(v: Pick<CatalogueVariant, 'title' | 'flavour' | 'size'>): string {
  const parts = [v.flavour, v.size].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : v.title
}

function Fact({ glyph, label, value, hue }: { glyph: string; label: string; value: string; hue: string }) {
  return (
    <div className="flex-1 min-w-0 rounded-xl p-3" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
      <span style={{ color: hue }}><QuizIcon name={glyph} size={18} /></span>
      <p className="label mt-2" style={{ color: 'var(--color-muted)' }}>{label}</p>
      <p className="text-xs font-semibold mt-0.5 leading-snug" style={{ color: 'var(--color-text)' }}>{value}</p>
    </div>
  )
}

interface Props {
  product: CatalogueProduct
  /** The variant currently chosen — drives the picker's selected state. */
  variant: CatalogueVariant | undefined
  onSelectVariant: (id: string) => void
  /** The category's colour, so the sheet and the page tint identically. */
  hue: string
  className?: string
}

export function ProductDetailBody({ product, variant, onSelectVariant, hue, className }: Props) {
  const price = variant?.price ?? product.basePrice

  // Honest subscribe-&-save figure for this variant — the same discount the basket
  // nudge quotes, shown as a concrete monthly price.
  const subscribePct = Math.round(PRICING_CONFIG.subscriptionDiscount * 100)
  const monthlyPrice = price * (1 - PRICING_CONFIG.subscriptionDiscount)

  const facts = productFacts(product)
  const dietary = productDietary(product)
  const bars = productBars(product, product.goals.slice(0, 4).map(goalAxis))
  const showVariantPicker = product.variants.length > 1

  return (
    <div className={`space-y-6 ${className ?? ''}`}>
      <section>
        <p className="label mb-2" style={{ color: hue }}>What it is</p>
        {product.shortReason && product.shortReason !== product.description && (
          <p className="text-sm font-semibold leading-snug mb-1.5" style={{ color: 'var(--color-text)' }}>{product.shortReason}</p>
        )}
        {/* `pre-line`, because `cleanDescription` keeps the supplier's
            paragraph and bullet breaks as newlines — without it they
            collapse and the whole description runs together as one block. */}
        <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-2)', whiteSpace: 'pre-line' }}>{product.description}</p>
      </section>

      {product.subscriptionEligible && (
        <Link
          href="/"
          className="flex items-center gap-3 rounded-2xl px-4 py-3 active:scale-[0.99] transition-transform"
          style={{ background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-accent) 22%, transparent)' }}
        >
          <span className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)' }} aria-hidden>
            <CHRGDBolt size={15} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>Subscribe &amp; save {subscribePct}%</p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-2)' }}>on a personalised monthly plan</p>
          </div>
          <span className="text-sm font-black whitespace-nowrap tabular-nums" style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-display)' }}>
            {formatGBP(monthlyPrice)}<span className="text-[10px] font-semibold">/mo</span>
          </span>
          <span style={{ color: 'var(--color-accent)' }} aria-hidden>→</span>
        </Link>
      )}

      {bars.length > 0 && <StatBars bars={bars} animate={false} label="Best for" />}

      {facts.length > 0 && (
        <section>
          <p className="label mb-2.5" style={{ color: 'var(--color-muted)' }}>The facts</p>
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
          <p className="label mb-2.5" style={{ color: 'var(--color-muted)' }}>Flavour &amp; size</p>
          <div className="flex flex-col gap-1.5">
            {product.variants.map((v) => {
              const isSelected = v.id === variant?.id
              const vStock = variantStock(v)
              return (
                <button
                  key={v.id}
                  onClick={() => { if (v.available) onSelectVariant(v.id) }}
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
                    {!v.available ? (
                      <span className="text-[9px]" style={{ color: product.restockingSoon ? 'var(--color-amber)' : 'var(--color-muted)' }}>
                        {product.restockingSoon ? 'Back in stock soon' : 'Sold out'}
                      </span>
                    ) : vStock.low && vStock.count != null ? (
                      <span className="text-[9px] font-bold tabular-nums" style={{ color: 'var(--color-amber)' }}>{vStock.count} left</span>
                    ) : null}
                    <span className="text-sm font-bold tabular-nums" style={{ color: isSelected ? ACCENT : 'var(--color-muted)' }}>{formatGBP(v.price)}</span>
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
  )
}
