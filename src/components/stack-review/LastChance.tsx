'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SLOT_LABELS, type CatalogueProduct, type StackSlot } from '@/lib/catalogue/types'
import type { StackSlotEntry } from '@/lib/stack-blueprint/types'
import { getPricingConfig, type UsageLevel } from '@/lib/stack-blueprint/pricing'
import type { Goal, QuizAnswers } from '@/lib/types'
import { pickHeroOffer } from '@/lib/last-chance/pick'
import type { PublicOfferQuote } from '@/lib/last-chance/economics'
import { useOfferCheckout } from '@/hooks/useOfferCheckout'
import { track } from '@/lib/analytics/events'
import { PRICING_SYNCED_EVENT } from '@/lib/pricing/sync-event'
import { LastChanceView } from './LastChanceView'

/**
 * The last-chance offer at the foot of the results page: choosing the product,
 * watching for the scroll that reveals it, and buying it.
 *
 * Renders nothing when no product in the stack can carry a real deal at a
 * profit (`pickHeroOffer` returns null) — an offer the business cannot afford
 * is not made, and a full price is never dressed up as one.
 */
export function LastChance({ slots, products, answers, primaryGoal, usage, blocked, onBackToStack, onCtaRef }: {
  slots: StackSlotEntry[]
  /** The whole catalogue — the lookup the slots resolve against. */
  products: CatalogueProduct[]
  /** Their answers: a fresh fit score, their goals in their own words, their usage. */
  answers?: QuizAnswers | null
  /** The goal that matters most, when the answers do not say. */
  primaryGoal?: Goal | null
  usage?: Record<string, UsageLevel>
  /** The stack's own checkout is under way. */
  blocked?: boolean
  onBackToStack: () => void
  onCtaRef?: (el: HTMLButtonElement | null) => void
}) {
  // Re-worked when the founders' pricing settings land in the browser, so a
  // deal is never shown on the defaults the server will not honour.
  const [pricingVersion, setPricingVersion] = useState(0)
  useEffect(() => {
    const bump = () => setPricingVersion((v) => v + 1)
    window.addEventListener(PRICING_SYNCED_EVENT, bump)
    return () => window.removeEventListener(PRICING_SYNCED_EVENT, bump)
  }, [])
  const hero = useMemo(
    () => pickHeroOffer(slots, products, { answers, primaryGoal, usage }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pricingVersion stands in for the module-level config
    [slots, products, answers, primaryGoal, usage, pricingVersion],
  )

  const { state, buy } = useOfferCheckout()
  // When the server says the price moved, show its figure and buy at that.
  const [override, setOverride] = useState<PublicOfferQuote | null>(null)
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
        track('last_chance_view', { slot: hero.slotType, discountPct: hero.quote.discountPct, delivery: hero.quote.deliveryDeal })
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

  const quote: PublicOfferQuote | null = override ?? hero?.quote ?? null
  const onBuy = useCallback(() => {
    if (!hero || !quote || blocked) return
    void buy({ variantId: hero.variant.id, productTitle: hero.product.title, quote, claimId: hero.claim?.id ?? null })
  }, [buy, hero, quote, blocked])

  if (!hero || !quote || !quote.viable) return null

  return (
    <LastChanceView
      title={hero.product.title}
      role={SLOT_LABELS[hero.slotType as StackSlot] ?? hero.product.category ?? ''}
      imageUrl={hero.product.imageUrl ?? null}
      slotType={hero.slotType}
      goalLine={hero.goalLine}
      claim={hero.claim?.wording ?? null}
      servings={hero.servings}
      packMonths={hero.packMonths}
      deal={quote}
      remoteSurcharge={getPricingConfig().delivery.zone2Surcharge}
      status={state.status}
      message={state.status === 'error' || state.status === 'changed' ? state.message : null}
      blocked={blocked}
      phase={phase}
      sectionRef={setSection}
      onBuy={onBuy}
      onBackToStack={onBackToStack}
      onCtaRef={onCtaRef}
    />
  )
}
