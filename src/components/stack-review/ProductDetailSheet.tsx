'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { StackSlotEntry } from '@/lib/stack-blueprint'
import type { SlotType } from '@/lib/stack-blueprint/factory'
import { formatGBP, PRICING_CONFIG, type UsageLevel } from '@/lib/stack-blueprint/pricing'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { QuizAnswers } from '@/lib/types'
import type { PlanType } from '@/lib/store'
import { productTypeLabel } from '@/lib/catalogue/product-type'
import { productDietary, stackProductFacts } from '@/lib/product-facts'
import { interchangeableVariants } from '@/lib/shop/per-serving'
import { explainProductSafe } from '@/lib/results'
import { cardClaim, cardFacts, usageFor } from '@/lib/results/card-facts'
import { QuizIcon } from '@/components/quiz/QuizIcon'
import { IconButton } from '@/components/ui/IconButton'
import { ProductTile } from './ProductTile'

interface Props {
  slot: StackSlotEntry
  product: CatalogueProduct | undefined
  planType: PlanType
  /** The monthly product this slot resolves to on subscription (may be the product itself). */
  subscriptionProduct?: CatalogueProduct
  /** Their quiz answers. Without them there is no "Why it's in your stack". */
  answers?: QuizAnswers | null
  /** Usage chosen in the plan journey, by product id. Standard when absent. */
  usage?: Record<string, UsageLevel>
  onChangeVariant?: (slotId: string, variantId: string) => void
  /** Fired when the user taps "Swap product" — the card closes the sheet then opens the swap modal. */
  onSwap?: () => void
  /** Fired when the user taps "Remove". */
  onRemove?: () => void
  onClose: () => void
}

const ACCENT = '#00D4FF'

function variantLabel(v: { title: string; flavour: string | null; size: string | null }): string {
  const parts = [v.flavour, v.size].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : v.title
}

function Fact({ glyph, label, value, hue }: { glyph: string; label: string; value: string; hue: string }) {
  return (
    <div
      className="min-w-0 rounded-xl px-3 py-2.5 flex items-start gap-2.5"
      style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
    >
      <span className="flex-shrink-0 mt-0.5" style={{ color: hue }}>
        <QuizIcon name={glyph} size={16} />
      </span>
      <div className="min-w-0">
        <p className="text-[9px] font-bold tracking-widest uppercase" style={{ color: 'var(--color-text-2)', fontFamily: 'var(--font-display)' }}>
          {label}
        </p>
        <p className="text-[13px] font-semibold mt-0.5 leading-snug" style={{ color: 'var(--color-text)' }}>
          {value}
        </p>
      </div>
    </div>
  )
}

/** A register claim, verbatim, under the product it is about. */
function ClaimQuote({ title, wording, hue }: { title?: string; wording: string; hue: string }) {
  return (
    <figure
      className="pl-3.5 py-0.5"
      style={{ borderLeft: `2px solid color-mix(in srgb, ${hue} 55%, transparent)` }}
    >
      {title && (
        <p className="text-xs font-bold leading-snug" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          {title}
        </p>
      )}
      <blockquote
        data-testid="sheet-claim"
        className={`text-[13px] leading-relaxed ${title ? 'mt-1' : ''}`}
        style={{ color: 'var(--color-text-2)' }}
      >
        &ldquo;{wording}&rdquo;
      </blockquote>
    </figure>
  )
}

const SECTION_LABEL = 'text-[10px] font-bold tracking-widest uppercase'

/**
 * The full-detail bottom sheet for a stack product: why it is in their stack,
 * what it does in the register's words, what a pack holds, costs and lasts,
 * dietary info, the flavour/size picker and the swap/remove actions.
 *
 * "Why it's in your stack" is `explainProduct` (lib/results): something they
 * told us, then the product and its claim, verbatim. When nothing qualifies
 * the section is left out. It is never `slot.reason`, which is engine or AI
 * copy no claim check has seen.
 */
export function ProductDetailSheet({
  slot, product, planType, subscriptionProduct, answers, usage, onChangeVariant, onSwap, onRemove, onClose,
}: Props) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Lock scroll while open, restore on close
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // One hue for every product: a per-slot colour (purple for sleep, red for
  // health) would say what the product is for.
  const hue = 'var(--color-accent)'

  const subProduct = subscriptionProduct ?? product
  const canSubscribe = !!subProduct?.subscriptionEligible
  const flipsToRefill = !!product && !!subProduct && subProduct.id !== product.id && canSubscribe
  const subPrice = subProduct
    ? (subProduct.variants.find((v) => v.available)?.price ?? subProduct.basePrice) * (1 - PRICING_CONFIG.subscriptionDiscount)
    : 0
  const inSubView = planType === 'subscription'

  const numbers = useMemo(
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
  const explanation = useMemo(
    () => (product && answers ? explainProductSafe({ product, slotType: slot.slotType as SlotType, answers }) : null),
    [product, slot.slotType, answers],
  )
  // The card's claim. When the why-line carries it, it is said there, once.
  const claim = product ? cardClaim(product, explanation, answers) : null
  const whatItDoes = claim && !explanation?.claim ? claim : null

  const selectedVariant = numbers?.variant
  const price = numbers?.price ?? 0
  /*
    Only the variants that are a straight swap for the chosen one — same
    product, same serving count. A plan has already sized the month and priced
    it from that count, so offering a 454-serving bag as a "flavour" of a
    33-serving bottle silently reprices somebody's stack. Other sizes are a
    decision, and they belong on the product page. See `interchangeableVariants`.
  */
  const swappable = product ? interchangeableVariants(product, selectedVariant) : []
  const otherSizes = product ? product.variants.length - swappable.length : 0
  const showVariantPicker = product && swappable.length > 1

  const dietary = product ? productDietary(product) : []
  // Format, servings, cost per serving and how long it lasts, for the variant
  // on screen. No "You'll feel it" fact: a felt-effect window is an implied
  // claim (Phase 1). The shop sheet keeps `productFacts`.
  const facts = product && numbers ? stackProductFacts(product, numbers, { atYourUsage: !!answers }) : []

  if (!mounted) return null

  return createPortal(
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ background: 'rgba(0,0,0,0.72)' }}
    >
      {/* Bottom sheet */}
      <div
        className="w-full max-w-lg rounded-t-3xl overflow-hidden flex flex-col"
        style={{ background: 'var(--color-surface)', maxHeight: '90dvh' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-[var(--color-border-2)]" />
        </div>

        {/* Header — product hero */}
        <div className="px-5 pt-2 pb-4 flex items-start gap-4 flex-shrink-0 border-b border-[var(--color-border)]">
          <ProductTile imageUrl={selectedVariant?.imageUrl ?? product?.imageUrl} formats={product?.formats} title={product?.title} size={92} />
          <div className="flex-1 min-w-0 pt-0.5">
            <span
              className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold tracking-widest uppercase mb-1.5"
              style={{
                color: hue,
                background: `color-mix(in srgb, ${hue} 12%, transparent)`,
                border: `1px solid color-mix(in srgb, ${hue} 24%, transparent)`,
                fontFamily: 'var(--font-display)',
              }}
            >
              {productTypeLabel(product)}
            </span>
            <h3 className="text-lg font-black leading-tight" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
              {product?.title ?? 'Product unavailable'}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-base font-black" style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-display)' }}>
                £{price.toFixed(2)}
              </span>
              {selectedVariant && (
                <span className="text-xs truncate" style={{ color: 'var(--color-text-2)' }}>
                  {variantLabel(selectedVariant)}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span
                className="px-2 py-0.5 rounded-full text-[9px] font-semibold"
                style={{ border: '1px solid var(--color-border-2)', color: 'var(--color-text-2)' }}
              >
                {slot.required ? 'Core to your stack' : 'Optional add-on'}
              </span>
              {inSubView ? (
                canSubscribe ? (
                  <span
                    className="px-2 py-0.5 rounded-full text-[9px] font-semibold"
                    style={{ color: ACCENT, background: `color-mix(in srgb, ${ACCENT} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${ACCENT} 20%, transparent)` }}
                  >
                    {flipsToRefill ? 'Monthly refill' : 'In monthly plan'}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold" style={{ border: '1px solid var(--color-border-2)', color: 'var(--color-text-2)' }}>
                    One-off only
                  </span>
                )
              ) : (
                canSubscribe && (
                  <span
                    className="px-2 py-0.5 rounded-full text-[9px] font-semibold"
                    style={{ color: ACCENT, background: `color-mix(in srgb, ${ACCENT} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${ACCENT} 20%, transparent)` }}
                  >
                    Subscribe-ready
                  </span>
                )
              )}
            </div>
          </div>
          <IconButton icon="x" label="Close" size="sm" filled onClick={onClose} />
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-5 space-y-6">
          {/* Why it's in your stack: something they told us, then the product
              and its claim. Left out when nothing may honestly be said. */}
          {explanation && (
            <section data-testid="why-in-stack">
              <p className={`${SECTION_LABEL} mb-2`} style={{ color: hue, fontFamily: 'var(--font-display)' }}>
                Why it&apos;s in your stack
              </p>
              <p className="text-sm font-semibold leading-relaxed mb-3" style={{ color: 'var(--color-text)' }}>
                {explanation.sentence}
              </p>
              {explanation.claim ? (
                <ClaimQuote title={product?.title} wording={explanation.claim.wording} hue={hue} />
              ) : (
                <p className="text-xs font-bold leading-snug" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
                  {product?.title}
                </p>
              )}
            </section>
          )}

          {/* What it does: the register's words, when the why-line has not
              already said them. A kind with no authorised claim gets nothing. */}
          {whatItDoes && (
            <section data-testid="what-it-does">
              <p className={`${SECTION_LABEL} mb-2`} style={{ color: explanation ? 'var(--color-text-2)' : hue, fontFamily: 'var(--font-display)' }}>
                What it does
              </p>
              <ClaimQuote wording={whatItDoes.wording} hue={hue} />
            </section>
          )}

          {/* The facts */}
          {facts.length > 0 && (
            <section>
              <p className={`${SECTION_LABEL} mb-2.5`} style={{ color: 'var(--color-text-2)', fontFamily: 'var(--font-display)' }}>
                The facts
              </p>
              {/* Two a row; an odd last fact takes the full width. */}
              <div className="grid grid-cols-2 gap-2.5 [&>*:last-child:nth-child(odd)]:col-span-2">
                {facts.map((f) => (
                  <Fact key={f.key} glyph={f.glyph} label={f.label} value={f.value} hue={hue} />
                ))}
              </div>
              {dietary.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {dietary.map((label) => (
                    <span
                      key={label}
                      className="px-2.5 py-1 rounded-full text-[10px] font-semibold"
                      style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border-2)', color: 'var(--color-text-2)' }}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Subscription resolution note */}
          {inSubView && flipsToRefill && (
            <div
              className="px-3.5 py-3 rounded-xl text-[12px] leading-snug"
              style={{ color: 'var(--color-text-2)', background: `color-mix(in srgb, ${ACCENT} 6%, transparent)`, border: `1px solid color-mix(in srgb, ${ACCENT} 18%, transparent)` }}
            >
              On subscription you&rsquo;ll get <span className="font-semibold">{subProduct?.title}</span>{' '}
              at <span className="font-semibold">{formatGBP(subPrice)}/mo</span> — a monthly-sized refill
              so it ships every month.
            </div>
          )}

          {/* Flavour & size picker */}
          {showVariantPicker && (
            <section>
              <p className={`${SECTION_LABEL} mb-2.5`} style={{ color: 'var(--color-text-2)', fontFamily: 'var(--font-display)' }}>
                Flavour &amp; size
              </p>
              <div className="flex flex-col gap-1.5">
                {swappable.map((v) => {
                  const isSelected = (slot.selectedVariantId ?? selectedVariant?.id) === v.id
                  return (
                    <button
                      key={v.id}
                      onClick={() => { if (v.available) onChangeVariant?.(slot.slotId, v.id) }}
                      disabled={!v.available}
                      className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-left transition-all active:scale-[0.98]"
                      style={{
                        background: isSelected ? `color-mix(in srgb, ${ACCENT} 12%, transparent)` : 'var(--color-surface-2)',
                        border: isSelected ? `1px solid color-mix(in srgb, ${ACCENT} 35%, transparent)` : '1px solid var(--color-border)',
                        opacity: v.available ? 1 : 0.4,
                        cursor: v.available ? 'pointer' : 'not-allowed',
                      }}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-3.5 h-3.5 rounded-full flex-shrink-0 flex items-center justify-center"
                          style={{ background: isSelected ? ACCENT : 'transparent', border: isSelected ? 'none' : '1.5px solid var(--color-border-2)' }}
                        >
                          {isSelected && (
                            <svg width="7" height="6" viewBox="0 0 8 6" fill="none">
                              <path d="M1 3L3 5L7 1" stroke="#0A0A0A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                        <span className="text-sm font-medium" style={{ color: isSelected ? 'var(--color-text)' : 'var(--color-text-2)' }}>
                          {variantLabel(v)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {!v.available && <span className="text-[9px]" style={{ color: 'var(--color-muted)' }}>Sold out</span>}
                        <span className="text-sm font-bold" style={{ color: isSelected ? ACCENT : 'var(--color-muted)' }}>
                          £{v.price.toFixed(2)}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
              {/* Said, not hidden: a picker that quietly drops two of a
                  product's four options looks like a bug to the one person who
                  knows the range. */}
              {otherSizes > 0 && (
                <p className="text-[11px] mt-2" style={{ color: 'var(--color-muted)' }}>
                  {otherSizes === 1 ? 'One other size is' : `${otherSizes} other sizes are`} sold on the product
                  page — a different serving count changes what your plan costs, so it is not a swap.
                </p>
              )}
            </section>
          )}

          {/* Warnings — fine print */}
          {product && product.warnings.length > 0 && (
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--color-muted)' }}>
              {product.warnings.join(' · ')}
            </p>
          )}
        </div>

        {/* Sticky footer actions */}
        {(slot.canSwap || slot.canRemove) && (
          <div
            className="flex gap-2.5 px-5 py-3.5 flex-shrink-0 pb-[max(0.9rem,env(safe-area-inset-bottom))]"
            style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
          >
            {slot.canSwap && (
              <button
                onClick={onSwap}
                className="flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-95"
                style={{ border: '1px solid var(--color-border-2)', color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}
              >
                Swap product
              </button>
            )}
            {slot.canRemove && (
              <button
                onClick={onRemove}
                className="py-3 px-5 rounded-xl text-sm font-semibold transition-all active:scale-95"
                style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-display)' }}
              >
                Remove
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
