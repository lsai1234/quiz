'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SLOT_LABELS, type CatalogueProduct, type StackSlot } from '@/lib/catalogue/types'
import type { StackSlotEntry } from '@/lib/stack-blueprint/types'
import type { SubscriptionLine } from '@/lib/stack-blueprint/pricing'
import { pickHeroOffer } from '@/lib/last-chance/pick'
import type { OfferQuote } from '@/lib/last-chance/economics'
import { useOfferCheckout } from '@/hooks/useOfferCheckout'
import { track } from '@/lib/analytics/events'
import { LastChanceView } from './LastChanceView'

/**
 * The last-chance offer at the foot of the results page: choosing the product,
 * watching for the scroll that reveals it, and buying it.
 *
 * Renders nothing when no product in the stack can be sold on its own at a
 * profit (`pickHeroOffer` returns null) — an offer the business cannot afford
 * is not made, rather than made smaller.
 */
export function LastChance({ slots, products, subscriptionPlan, onBackToStack, onCtaRef }: {
  slots: StackSlotEntry[]
  /** The whole catalogue — the lookup the slots resolve against. */
  products: CatalogueProduct[]
  /** For how long one pack lasts at their usage. */
  subscriptionPlan: SubscriptionLine[]
  onBackToStack: () => void
  onCtaRef?: (el: HTMLButtonElement | null) => void
}) {
  /*
    How long a pack lasts, from the plan's own usage maths: one unit covers
    1 ÷ monthlyUnits months. Only where the plan ships the very product the
    stack holds — a monthly refill's usage says nothing about the tub on offer.
  */
  const packMonthsByProductId = useMemo(() => {
    const out: Record<string, number> = {}
    for (const line of subscriptionPlan) {
      if (line.monthlyUnits > 0) out[line.product.id] = 1 / line.monthlyUnits
    }
    return out
  }, [subscriptionPlan])

  const hero = useMemo(
    () => pickHeroOffer(slots, products, { packMonthsByProductId }),
    [slots, products, packMonthsByProductId],
  )

  const { state, buy } = useOfferCheckout()
  // When the server says the price moved, show its figure and buy at that.
  const [override, setOverride] = useState<OfferQuote | null>(null)
  useEffect(() => {
    if (state.status === 'changed' && state.quote) setOverride(state.quote)
  }, [state])
  useEffect(() => setOverride(null), [hero?.variant.id])

  const [phase, setPhase] = useState<'wait' | 'go'>('wait')
  const [section, setSection] = useState<HTMLElement | null>(null)
  const told = useRef(false)
  useEffect(() => {
    if (!section || phase === 'go') return
    const reveal = () => {
      setPhase('go')
      if (!told.current && hero) {
        told.current = true
        track('last_chance_view', { slot: hero.slotType, discountPct: hero.quote.discountPct })
      }
    }
    if (typeof IntersectionObserver === 'undefined') {
      reveal()
      return
    }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        reveal()
        io.disconnect()
      }
    }, { threshold: 0.2 })
    io.observe(section)
    return () => io.disconnect()
  }, [section, phase, hero])

  const quote = override ?? hero?.quote ?? null
  const onBuy = useCallback(() => {
    if (!hero || !quote) return
    void buy({ variantId: hero.variant.id, productTitle: hero.product.title, quote })
  }, [buy, hero, quote])

  if (!hero || !quote || !quote.viable) return null

  return (
    <LastChanceView
      title={hero.product.title}
      role={SLOT_LABELS[hero.slotType as StackSlot] ?? hero.product.category ?? ''}
      imageUrl={hero.product.imageUrl ?? null}
      slotType={hero.slotType}
      reason={hero.reason}
      claims={hero.claims}
      noticeable={hero.noticeable}
      onset={hero.onset}
      packMonths={hero.packMonths}
      listPrice={quote.listPrice}
      offerPrice={quote.offerPrice}
      discountPct={quote.discountPct}
      saving={quote.totalSaving}
      deliveryCharge={quote.deliveryCharge}
      total={quote.total}
      status={state.status}
      message={state.status === 'error' || state.status === 'changed' ? state.message : null}
      phase={phase}
      sectionRef={setSection}
      onBuy={onBuy}
      onBackToStack={onBackToStack}
      onCtaRef={onCtaRef}
    />
  )
}
