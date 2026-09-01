'use client'

import { useCallback, useRef, useState } from 'react'
import { basketToCheckoutLines } from '@/lib/basket/helpers'
import type { ResolvedBasketLine } from '@/lib/basket/types'
import { track } from '@/lib/analytics/events'

export type ShopCheckoutState =
  | { status: 'idle' }
  /** Creating the Checkout Session. The trigger is disabled; nothing has happened yet. */
  | { status: 'loading' }
  /**
   * The session exists and the browser is navigating to Stripe.
   *
   * A state of its own, and NOT a success state (OC-F-002/OC-F-005). It used to
   * be `success`, which meant the "order on its way" screen rendered for the
   * length of the redirect — telling customers their order was placed before
   * they had paid, and firing the conversion event on people who then abandoned
   * at Stripe. Copy for this state may name the DESTINATION, never the outcome.
   */
  | { status: 'redirecting' }
  | { status: 'error'; message: string }
  /**
   * Mock payments only: there is no Stripe to go to, so the demo order is
   * complete. Real payments never reach this — they end at `redirecting` and the
   * customer comes back to the confirmation route.
   */
  | { status: 'mock-complete'; orderId: string | null }

/**
 * One-off shop checkout: hands the basket to `POST /api/cart` and follows the
 * URL it returns.
 *
 * The SERVER decides whether that's a real Stripe Checkout Session or the
 * `#mock-checkout` placeholder — it re-prices every line from the catalogue and
 * reads the payments resolver, neither of which the browser can be trusted with.
 * This hook used to short-circuit to the placeholder whenever the old Shopify
 * integration wasn't live, which meant that with the shipping default (it always
 * is) the request was never made at all and Stripe could not be reached however
 * it was configured. Deciding here is what broke it; the fix is to stop.
 */
/** How long to wait for the redirect before handing control back (OC-F-006). */
const INITIATION_TIMEOUT_MS = 10_000

export function useShopCheckout() {
  const [state, setState] = useState<ShopCheckoutState>({ status: 'idle' })
  // Survives re-renders, unlike state, so a double-tap can't slip between them.
  const inFlight = useRef(false)

  const checkout = useCallback(async (
    resolved: ResolvedBasketLine[],
    source: 'basket' | 'buy_now' = 'basket',
    /**
     * A code typed into the basket, passed straight through.
     *
     * The server decides what it is worth — and, for a founder code, whether it
     * lets this basket past the minimum order at all. Nothing here interprets
     * it; the name is `partnerCode` on the wire because that is the field
     * `/api/cart` has always read, and one field taking one code is better than
     * two fields the browser has to choose between.
     */
    code: string | null = null,
  ) => {
    if (resolved.length === 0) {
      setState({ status: 'error', message: 'Your basket is empty.' })
      return
    }
    // Guard against a double-tap creating two Checkout Sessions (OC-E-016).
    if (inFlight.current) return
    inFlight.current = true
    setState({ status: 'loading' })

    const value = Math.round(resolved.reduce((sum, l) => sum + l.lineTotal, 0) * 100) / 100
    track('checkout_start', { source, items: resolved.length, value })

    const lines = basketToCheckoutLines(resolved)

    // If the session can't be created, or the redirect never happens, put the
    // customer back in control rather than leaving them on a dead spinner
    // (OC-F-006).
    const timeout = setTimeout(() => {
      inFlight.current = false
      setState({
        status: 'error',
        message: 'Checkout is taking longer than expected. Your basket is safe — please try again.',
      })
    }, INITIATION_TIMEOUT_MS)

    try {
      const res = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines, ...(code ? { partnerCode: code } : {}) }),
      })
      const data: { checkoutUrl?: string; mock?: boolean; orderId?: string; error?: string } = await res.json()
      if (!res.ok || !data.checkoutUrl) {
        clearTimeout(timeout)
        inFlight.current = false
        track('checkout_error', { source, message: data.error ?? 'unknown' })
        setState({ status: 'error', message: data.error ?? 'Something went wrong. Please try again.' })
        return
      }

      // No Stripe to go to, and the order is already paid. Two ways to get
      // here: mock payments (`#mock-checkout`), and a founder "everything free"
      // code (`#founder-code`), where the order genuinely cost £0.00 and there
      // was nothing for Stripe to take.
      //
      // Both go to the REAL confirmation route, so mock mode exercises the same
      // screen live traffic will rather than it only ever being tested in
      // production. This is a route change AFTER completion, which is fine;
      // OC-F-004 prohibits one DURING initiation.
      if (data.checkoutUrl.startsWith('#')) {
        clearTimeout(timeout)
        if (data.orderId) {
          setState({ status: 'redirecting' })
          window.location.href = `/order/confirmation?order=${encodeURIComponent(data.orderId)}`
          return
        }
        inFlight.current = false
        setState({ status: 'mock-complete', orderId: null })
        return
      }

      // Real payment. `redirecting` says where they're going, not that anything
      // has been bought — the purchase event fires on the confirmation screen,
      // once, and only after the server has verified the session.
      setState({ status: 'redirecting' })
      window.location.href = data.checkoutUrl
      // Deliberately leave `inFlight` set and the timeout running: the page is
      // navigating away, and re-enabling the button mid-navigation would invite
      // a second session.
    } catch {
      clearTimeout(timeout)
      inFlight.current = false
      track('checkout_error', { source, message: 'network' })
      setState({ status: 'error', message: 'Unable to reach the store. Check your connection and try again.' })
    }
  }, [])

  const reset = useCallback(() => {
    inFlight.current = false
    setState({ status: 'idle' })
  }, [])

  return { state, checkout, reset }
}
