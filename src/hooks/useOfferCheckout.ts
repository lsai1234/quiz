'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { track } from '@/lib/analytics/events'
import { CORE_OFFER_SOURCE, LAST_CHANCE_SOURCE } from '@/lib/last-chance/source'
import type { PublicOfferQuote } from '@/lib/last-chance/economics'
import { useQuizStore } from '@/lib/store'
import { orderSafetyFor } from '@/lib/consult/exclusions'

/**
 * Buying the last-chance offer: one product, straight to payment.
 *
 * The shop's checkout state machine (`useShopCheckout`), aimed at one line and
 * carrying the offer. The browser says which variant, and the price and the
 * delivery it showed; `/api/cart` works the deal out again and refuses to
 * charge more than either.
 * Guest checkout, so there is no account or consent gate between the tap and
 * the payment page.
 */
export type OfferCheckoutState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'redirecting' }
  | { status: 'error'; message: string }
  /** The server's price moved since the card was drawn — show the new one. */
  | { status: 'changed'; message: string; quote: PublicOfferQuote | null }

const INITIATION_TIMEOUT_MS = 10_000

export function useOfferCheckout() {
  const [state, setState] = useState<OfferCheckoutState>({ status: 'idle' })
  // A ref, not state: a double tap must not slip between two renders.
  const inFlight = useRef(false)

  // Back from Stripe, a browser can restore this page from its cache exactly
  // as it was left — "Taking you to checkout…", button stood down — and
  // nothing would ever wake it. Come back to a card that can be tapped again.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return
      inFlight.current = false
      setState({ status: 'idle' })
    }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [])

  const buy = useCallback(async (offer: {
    variantId: string
    productTitle: string
    quote: PublicOfferQuote
    /** The register claim shown on the card, kept with the order (OC-C-006). */
    claimId?: string | null
    /** Sold as the approved hero ("Not the obvious pick"): the server checks it still is one. */
    hero?: boolean
    /**
     * Bought at its ordinary price, not on the deal: the product has no deal,
     * or this browser has had it. The ordinary checkout prices it, as the shop
     * would; the delivered price on the card is that same figure.
     */
    ordinary?: boolean
  }) => {
    if (inFlight.current) return
    inFlight.current = true
    setState({ status: 'loading' })
    const value = offer.ordinary ? offer.quote.normalTotal : offer.quote.total
    track('last_chance_buy', { discountPct: offer.ordinary ? 0 : offer.quote.discountPct, delivery: offer.ordinary ? 'standard' : offer.quote.deliveryDeal, value })
    track('checkout_start', { source: 'last_chance', items: 1, value })

    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), INITIATION_TIMEOUT_MS)
    try {
      const res = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          lines: [{
            variantId: offer.variantId,
            quantity: 1,
            attributes: [
              { key: 'source', value: offer.ordinary ? CORE_OFFER_SOURCE : LAST_CHANCE_SOURCE },
              { key: 'product', value: offer.productTitle },
              ...(offer.claimId ? [{ key: 'claim', value: offer.claimId }] : []),
            ],
          }],
          ...(offer.ordinary
            ? {}
            : {
                lastChance: {
                  variantId: offer.variantId,
                  expectedPrice: offer.quote.offerPrice,
                  expectedDelivery: offer.quote.deliveryCharge,
                  ...(offer.hero ? { hero: true } : {}),
                },
              }),
          // A consult stack's exclusions travel with the order (`orderSafetyFor`).
          safety: orderSafetyFor(useQuizStore.getState().answers),
        }),
      })
      const data: {
        checkoutUrl?: string
        orderId?: string
        error?: string
        offerChanged?: boolean
        heroChanged?: boolean
        quote?: PublicOfferQuote
      } | null = await res.json().catch(() => null)

      if (res.status === 409 && data?.offerChanged) {
        setState({ status: 'changed', message: data.error ?? 'This offer has changed.', quote: data.quote ?? null })
        return
      }
      if (!res.ok || !data?.checkoutUrl) {
        const message = data?.error ?? 'We couldn’t start your checkout. Please try again.'
        track('checkout_error', { source: 'last_chance', message: message.slice(0, 120) })
        setState({ status: 'error', message })
        return
      }
      setState({ status: 'redirecting' })
      // Mock payments raise a paid order inline; land on its real confirmation,
      // as the shop does, rather than pretending in the page.
      window.location.href = data.checkoutUrl.startsWith('#') && data.orderId
        ? `/order/confirmation?order=${encodeURIComponent(data.orderId)}`
        : data.checkoutUrl
    } catch {
      const message = controller.signal.aborted
        ? 'That took too long — please try again.'
        : 'Unable to reach the store. Check your connection and try again.'
      track('checkout_error', { source: 'last_chance', message })
      setState({ status: 'error', message })
    } finally {
      window.clearTimeout(timer)
      inFlight.current = false
    }
  }, [])

  const reset = useCallback(() => setState({ status: 'idle' }), [])
  return { state, buy, reset }
}
