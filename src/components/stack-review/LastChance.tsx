'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SLOT_LABELS, type CatalogueProduct, type StackSlot } from '@/lib/catalogue/types'
import type { StackSlotEntry } from '@/lib/stack-blueprint/types'
import type { UsageLevel } from '@/lib/stack-blueprint/pricing'
import type { Goal, QuizAnswers } from '@/lib/types'
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
  const hero = useMemo(
    () => pickHeroOffer(slots, products, { answers, primaryGoal, usage }),
    [slots, products, answers, primaryGoal, usage],
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
      listPrice={quote.listPrice}
      offerPrice={quote.offerPrice}
      discountPct={quote.discountPct}
      saving={quote.totalSaving}
      deliveryCharge={quote.deliveryCharge}
      total={quote.total}
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
