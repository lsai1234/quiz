'use client'

import Link from 'next/link'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { formatGBP, PRICING_CONFIG } from '@/lib/stack-blueprint/pricing'
import { variantStock } from '@/lib/shop/merchandising'
import { productFacts, productDietary } from '@/lib/product-facts'
import { QuizIcon } from '@/components/quiz/QuizIcon'
import { Badge } from '@/components/storefront'


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

function Fact({ glyph, label, value }: { glyph: string; label: string; value: string }) {
  return (
    <div className="flex-1 min-w-0" style={{ background: 'var(--surface)', borderRadius: 'var(--r-card)', padding: 'var(--space-4)' }}>
      <span style={{ color: 'var(--text-dim)' }}><QuizIcon name={glyph} size={18} /></span>
      <p className="sf-label" style={{ marginTop: 'var(--space-2)' }}>{label}</p>
      <p className="sf-body" style={{ color: 'var(--text)', marginTop: 'var(--space-1)' }}>{value}</p>
    </div>
  )
}

interface Props {
  product: CatalogueProduct
  /** The variant currently chosen — drives the picker's selected state. */
  variant: CatalogueVariant | undefined
  onSelectVariant: (id: string) => void
  className?: string
}

export function ProductDetailBody({ product, variant, onSelectVariant, className }: Props) {
  const price = variant?.price ?? product.basePrice

  // Honest subscribe-&-save figure for this variant — the same discount the basket
  // nudge quotes, shown as a concrete monthly price.
  const subscribePct = Math.round(PRICING_CONFIG.subscriptionDiscount * 100)
  const monthlyPrice = price * (1 - PRICING_CONFIG.subscriptionDiscount)

  const facts = productFacts(product)
  const dietary = productDietary(product)
  const showVariantPicker = product.variants.length > 1

  return (
    <div className={`space-y-6 ${className ?? ''}`}>
      <section>
        <p className="sf-label" style={{ marginBottom: 'var(--space-2)' }}>What it is</p>
        {product.shortReason && product.shortReason !== product.description && (
          <p className="sf-body" style={{ color: 'var(--text)', marginBottom: 'var(--space-2)' }}>{product.shortReason}</p>
        )}
        {/* `pre-line`, because `cleanDescription` keeps the supplier's
            paragraph and bullet breaks as newlines — without it they
            collapse and the whole description runs together as one block. */}
        <p className="sf-body" style={{ color: 'var(--text-dim)', whiteSpace: 'pre-line' }}>{product.description}</p>
      </section>

      {product.subscriptionEligible && (
        <Link
          href="/"
          data-interactive
          className="flex items-center"
          style={{ gap: 'var(--space-3)', background: 'var(--surface)', borderRadius: 'var(--r-card)', padding: 'var(--space-4)' }}
        >
          <div className="flex-1 min-w-0">
            <p className="sf-body" style={{ color: 'var(--text)' }}>Subscribe &amp; save {subscribePct}%</p>
            <p className="sf-meta">on a personalised monthly plan</p>
          </div>
          <span className="sf-num sf-body whitespace-nowrap" style={{ color: 'var(--text)' }}>
            {formatGBP(monthlyPrice)}<span className="sf-meta">/mo</span>
          </span>
        </Link>
      )}

      {facts.length > 0 && (
        <section>
          <p className="sf-label" style={{ marginBottom: 'var(--space-3)' }}>The facts</p>
          <div className="flex gap-2.5">
            {facts.map((f) => <Fact key={f.key} glyph={f.glyph} label={f.label} value={f.value} />)}
          </div>
          {dietary.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {dietary.map((label) => <Badge key={label}>{label}</Badge>)}
            </div>
          )}
        </section>
      )}

      {showVariantPicker && (
        <section>
          <p className="sf-label" style={{ marginBottom: 'var(--space-3)' }}>Flavour &amp; size</p>
          <div className="flex flex-col gap-1.5">
            {product.variants.map((v) => {
              const isSelected = v.id === variant?.id
              const vStock = variantStock(v)
              return (
                <button
                  key={v.id}
                  onClick={() => { if (v.available) onSelectVariant(v.id) }}
                  disabled={!v.available}
                  aria-pressed={isSelected}
                  data-interactive
                  className="w-full flex items-center justify-between text-left"
                  style={{
                    minHeight: 52,
                    padding: '0 var(--space-4)',
                    borderRadius: 'var(--r-control)',
                    border: 'none',
                    background: isSelected ? 'var(--surface-hi)' : 'var(--surface)',
                    color: isSelected ? 'var(--text)' : 'var(--text-dim)',
                    opacity: v.available ? 1 : 0.5,
                    cursor: v.available ? 'pointer' : 'not-allowed',
                  }}
                >
                  <span className="sf-body">{variantLabel(v)}</span>
                  <span className="flex items-center" style={{ gap: 'var(--space-3)' }}>
                    {!v.available ? (
                      <span className="sf-meta">{product.restockingSoon ? 'Back in stock soon' : 'Sold out'}</span>
                    ) : vStock.count != null && vStock.count < 5 ? (
                      <span className="sf-meta">Only <span className="sf-num">{vStock.count}</span> left</span>
                    ) : null}
                    <span className="sf-num sf-body" style={{ color: 'var(--text)' }}>{formatGBP(v.price)}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {product.warnings.length > 0 && (
        <p className="sf-meta">{product.warnings.join(' · ')}</p>
      )}
    </div>
  )
}
