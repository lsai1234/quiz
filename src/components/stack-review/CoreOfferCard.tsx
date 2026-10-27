'use client'

import { useEffect, useRef, useState } from 'react'
import { productTypeLabel } from '@/lib/catalogue/product-type'
import { getPricingConfig } from '@/lib/stack-blueprint/pricing'
import type { PublicOfferQuote } from '@/lib/last-chance/economics'
import type { CoreOffer } from '@/lib/offer/results'
import { OFFER_COPY } from '@/lib/offer/copy'
import { track } from '@/lib/analytics/events'
import { LastChanceView } from './LastChanceView'

/**
 * "Start here": the core offer, the first thing under their results (plan
 * Phase 4). The single-product offer that used to sit at the foot of the page,
 * moved up: the same deal (`quoteOffer`) and the same card (`LastChanceView`),
 * led by "Start here" and "Not the obvious pick" (the hero) or "Your top pick"
 * (the hero switch off).
 *
 * It arrives as it scrolls into view, once, as before; at the top of the page
 * that is straight away. Reduced motion gets the finished card.
 */
export function CoreOfferCard({ offer, override, status, message, blocked, note, onBuy, onBackToStack, onCtaRef }: {
  offer: CoreOffer
  /** The server's newer figures, when the deal moved since the page was drawn. */
  override: PublicOfferQuote | null
  status: 'idle' | 'loading' | 'redirecting' | 'error' | 'changed'
  message?: string | null
  blocked?: boolean
  /** One more line under the button, e.g. that a code works on the stack instead. */
  note?: string | null
  onBuy: () => void
  onBackToStack: () => void
  onCtaRef?: (el: HTMLButtonElement | null) => void
}) {
  const [phase, setPhase] = useState<'wait' | 'go'>('wait')
  const [section, setSection] = useState<HTMLElement | null>(null)
  const told = useRef(false)
  useEffect(() => {
    if (!section || phase === 'go') return
    const reveal = () => {
      setPhase('go')
      if (!told.current) {
        told.current = true
        track('last_chance_view', { slot: offer.product.stackSlots[0] ?? 'health', discountPct: offer.quote.discountPct, delivery: offer.quote.deliveryDeal })
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
  }, [section, phase, offer])

  return (
    <div className="px-5 pt-10" data-core-offer>
      <LastChanceView
        kicker={OFFER_COPY.startHere}
        heading={offer.label}
        ctaLabel={OFFER_COPY.startWithThis}
        backLabel={OFFER_COPY.fullStack}
        backIcon="chevron-down"
        note={note}
        title={offer.product.title}
        role={productTypeLabel(offer.product)}
        imageUrl={offer.product.imageUrl ?? null}
        formats={offer.product.formats}
        goalLine={offer.reason ?? ''}
        claim={offer.claim?.wording ?? null}
        servings={offer.servings}
        packMonths={offer.packMonths}
        deal={override ?? offer.quote}
        remoteSurcharge={getPricingConfig().delivery.zone2Surcharge}
        status={status}
        message={message}
        blocked={blocked}
        phase={phase}
        sectionRef={setSection}
        onBuy={onBuy}
        onBackToStack={onBackToStack}
        onCtaRef={onCtaRef}
      />
    </div>
  )
}
