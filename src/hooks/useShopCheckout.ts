'use client'

import { useCallback, useState } from 'react'
import { basketToCheckoutLines } from '@/lib/basket/helpers'
import type { ResolvedBasketLine } from '@/lib/basket/types'
import { track } from '@/lib/analytics/events'

export type ShopCheckoutState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; checkoutUrl: string; mock: boolean }

/**
 * One-off shop checkout: hands the basket to `POST /api/cart` and follows the
 * URL it returns.
 *
 * The SERVER decides whether that's a real Stripe Checkout Session or the
 * `#mock-checkout` placeholder — it re-prices every line from the catalogue and
 * reads the payments resolver, neither of which the browser can be trusted with.
 * This hook used to short-circuit to the placeholder whenever Shopify wasn't
 * live, which meant that with the shipping default (Shopify off, as it always
 * is) the request was never made at all and Stripe could not be reached however
 * it was configured. Deciding here is what broke it; the fix is to stop.
 */
export function useShopCheckout() {
  const [state, setState] = useState<ShopCheckoutState>({ status: 'idle' })

  const checkout = useCallback(async (resolved: ResolvedBasketLine[], source: 'basket' | 'buy_now' = 'basket') => {
    if (resolved.length === 0) {
      setState({ status: 'error', message: 'Your basket is empty.' })
      return
    }
    setState({ status: 'loading' })

    const value = Math.round(resolved.reduce((sum, l) => sum + l.lineTotal, 0) * 100) / 100
    track('checkout_start', { source, items: resolved.length, value })

    const lines = basketToCheckoutLines(resolved)

    try {
      const res = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines }),
      })
      const data: { checkoutUrl?: string; mock?: boolean; error?: string } = await res.json()
      if (!res.ok || !data.checkoutUrl) {
        track('checkout_error', { source, message: data.error ?? 'unknown' })
        setState({ status: 'error', message: data.error ?? 'Something went wrong. Please try again.' })
        return
      }
      track('checkout_success', { source, mock: data.mock ?? false, value })
      setState({ status: 'success', checkoutUrl: data.checkoutUrl, mock: data.mock ?? false })
      if (!data.checkoutUrl.startsWith('#')) window.location.href = data.checkoutUrl
    } catch {
      track('checkout_error', { source, message: 'network' })
      setState({ status: 'error', message: 'Unable to reach the store. Check your connection and try again.' })
    }
  }, [])

  const reset = useCallback(() => setState({ status: 'idle' }), [])

  return { state, checkout, reset }
}
