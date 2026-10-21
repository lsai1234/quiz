'use client'

import { useMemo, useState } from 'react'
import type { StackSlotEntry } from '@/lib/stack-blueprint'
import type { SlotType } from '@/lib/stack-blueprint/factory'
import type { UsageLevel } from '@/lib/stack-blueprint/pricing'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { QuizAnswers } from '@/lib/types'
import type { PlanType } from '@/lib/store'
import { slotVisual } from '@/lib/catalogue/slot-visuals'
import { productTypeLabel } from '@/lib/catalogue/product-type'
import { formatFact, packLengthShort, productDietary } from '@/lib/product-facts'
import { formatPerServing } from '@/lib/shop/per-serving'
import { explainProductSafe } from '@/lib/results'
import { cardClaim, cardFacts, usageFor } from '@/lib/results/card-facts'
import { ProductTile } from './ProductTile'
import { ProductDetailSheet } from './ProductDetailSheet'

interface Props {
  slot: StackSlotEntry
  product: CatalogueProduct | undefined
  planType: PlanType
  subscriptionProduct?: CatalogueProduct
  /** Their quiz answers: pick the claim, and size the pack length to them. */
  answers?: QuizAnswers | null
  /** Usage chosen in the plan journey, by product id. Standard when absent. */
  usage?: Record<string, UsageLevel>
  onChangeProduct?: (slotId: string) => void
  onChangeVariant?: (slotId: string, variantId: string) => void
  onRemove?: (slotId: string) => void
}

/** One cell of the card's stat row. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 min-w-0 px-2 first:pl-0 last:pr-0">
      <dt
        className="text-[8.5px] font-bold tracking-widest uppercase truncate"
        style={{ color: 'var(--color-text-2)', fontFamily: 'var(--font-display)' }}
      >
        {label}
      </dt>
      <dd
        className="text-[15px] font-black leading-tight mt-0.5 truncate tabular-nums"
        style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}
      >
        {value}
      </dd>
    </div>
  )
}

/**
 * The card for one stack product, laid out like a top-trumps card: picture and
 * type, name and format, the one claim the register allows for it, what a pack
 * holds, costs and lasts, and its price. Tapping the card opens the detail
 * sheet, where swap / flavour / remove live.
 *
 * What it does not say. The tag is the product type ("Vitamin C"), not the
 * slot title ("Immune Support"): a goal printed under a product's name is a
 * health claim. The slot's role line is gone for the same reason. The only
 * words about what a product does are its claim, verbatim from
 * `CLAIMS_BY_KIND`, and a kind with no claim shows none.
 *
 * Every number is left out when it is not known, rather than estimated.
 */
export function StatCard({
  slot, product, planType, subscriptionProduct, answers, usage, onChangeProduct, onChangeVariant, onRemove,
}: Props) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const hue = slotVisual(slot.slotType).hue

  const facts = useMemo(
    () => product
      ? cardFacts({
          product,
          selectedVariantId: slot.selectedVariantId,
          answers,
          usage: usageFor(usage, product, subscriptionProduct),
        })
      : null,
    [product, slot.selectedVariantId, answers, usage, subscriptionProduct],
  )
  const claim = useMemo(() => {
    if (!product) return null
    const explanation = answers ? explainProductSafe({ product, slotType: slot.slotType as SlotType, answers }) : null
    return cardClaim(product, explanation, answers)
  }, [product, slot.slotType, answers])

  const price = facts?.price ?? 0
  // Format, then up to two dietary tags. "Vegetarian" says nothing "Vegan" hasn't.
  const dietary = product ? productDietary(product) : []
  const meta = product
    ? [formatFact(product.formats).label, ...dietary.filter((d) => !(d === 'Vegetarian' && dietary.includes('Vegan'))).slice(0, 2)]
    : []
  const stats = [
    facts?.servings != null ? { label: 'Servings', value: String(Math.max(1, Math.round(facts.servings))) } : null,
    facts?.perServing != null ? { label: 'Per serving', value: formatPerServing(facts.perServing) } : null,
    facts?.packMonths != null ? { label: 'Lasts about', value: packLengthShort(facts.packMonths) } : null,
  ].filter((s): s is { label: string; value: string } => s != null)

  return (
    <>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="relative flex-1 flex flex-col w-full text-left rounded-2xl overflow-hidden h-full active:scale-[0.98] transition-transform"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        {/* The picture, on a wash of the product's hue. It takes whatever
            height the deck gives the card beyond its words, so a card
            stretched to match its neighbours grows its picture, not a gap. */}
        <div
          className="relative flex-1 min-h-[124px] flex items-center justify-center px-4 pt-9 pb-3"
          style={{ background: `radial-gradient(120% 95% at 50% 0%, color-mix(in srgb, ${hue} 16%, transparent), transparent 72%)` }}
        >
          <span
            className="absolute top-3 left-3 px-2 py-0.5 rounded-full text-[8px] font-bold tracking-widest uppercase"
            style={{
              color: hue,
              background: `color-mix(in srgb, ${hue} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${hue} 24%, transparent)`,
              fontFamily: 'var(--font-display)',
            }}
          >
            {productTypeLabel(product)}
          </span>
          <ProductTile
            imageUrl={facts?.variant?.imageUrl ?? product?.imageUrl}
            slot={slot.slotType}
            title={product?.title}
            size={92}
            style={{ boxShadow: '0 14px 30px -16px color-mix(in srgb, var(--color-bg) 85%, transparent)' }}
          />
        </div>

        {/* Name and format */}
        <div className="px-4 pt-1">
          <p className="text-[15px] font-bold leading-snug line-clamp-2" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
            {product?.title ?? 'Product unavailable'}
          </p>
          {meta.length > 0 && (
            <p className="text-[11px] leading-snug mt-0.5 truncate" style={{ color: 'var(--color-text-2)' }}>
              {meta.join(' · ')}
            </p>
          )}
        </div>

        {/* The claim, verbatim from the register, or nothing. Never clamped:
            a claim cut off mid-sentence is no longer the register's words. */}
        {claim && (
          <p
            data-testid="card-claim"
            className="mx-4 mt-3 pl-3 text-[11.5px] leading-[1.45]"
            style={{ color: 'var(--color-text-2)', borderLeft: `2px solid color-mix(in srgb, ${hue} 45%, transparent)` }}
          >
            &ldquo;{claim.wording}&rdquo;
          </p>
        )}

        {/* What a pack holds, costs and lasts, then the price. */}
        <div className="pt-3.5">
          {stats.length > 0 && (
            <dl className="mx-4 mb-3 pt-3 flex divide-x divide-[var(--color-border)] border-t border-[var(--color-border)]">
              {stats.map((s) => <Stat key={s.label} label={s.label} value={s.value} />)}
            </dl>
          )}

          <div className="px-4 py-2.5 flex items-center justify-between gap-3" style={{ borderTop: '1px solid var(--color-border)' }}>
            <span className="text-[10px] font-bold tracking-wide" style={{ color: 'var(--color-text-2)', fontFamily: 'var(--font-display)' }}>
              Tap for details ›
            </span>
            <span className="text-lg font-black leading-none" style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-display)' }}>
              £{price.toFixed(2)}
            </span>
          </div>
        </div>
      </button>

      {sheetOpen && (
        <ProductDetailSheet
          slot={slot}
          product={product}
          planType={planType}
          subscriptionProduct={subscriptionProduct}
          answers={answers}
          usage={usage}
          onChangeVariant={onChangeVariant}
          onSwap={() => { setSheetOpen(false); onChangeProduct?.(slot.slotId) }}
          onRemove={() => { setSheetOpen(false); onRemove?.(slot.slotId) }}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  )
}
