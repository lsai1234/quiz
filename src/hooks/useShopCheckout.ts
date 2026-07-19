'use client'

import { useCallback, useState } from 'react'
import { isShopifyLive } from '@/lib/data-source'
import { basketToCheckoutLines } from '@/lib/basket/helpers'
import type { ResolvedBasketLine } from '@/lib/basket/types'

export type ShopCheckoutState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; checkoutUrl: string; mock: boolean }

/**
 * One-off shop checkout: resolves the basket to Shopify cart lines and creates
 * a cart via POST /api/cart, then redirects to the Shopify checkout. In mock
 * mode (no live Shopify) it returns a placeholder URL so the UI can show a
 * success state without leaving the app — the same contract the stack checkout
 * uses.
 */
export function useShopCheckout() {
  const [state, setState] = useState<ShopCheckoutState>({ status: 'idle' })

  const checkout = useCallback(async (resolved: ResolvedBasketLine[]) => {
    if (resolved.length === 0) {
      setState({ status: 'error', message: 'Your basket is empty.' })
      return
    }
    setState({ status: 'loading' })

    const lines = basketToCheckoutLines(resolved)
    if (!isShopifyLive()) {
      setState({ status: 'success', checkoutUrl: '#mock-checkout', mock: true })
      return
    }

    try {
      const res = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines }),
      })
      const data: { checkoutUrl?: string; mock?: boolean; error?: string } = await res.json()
      if (!res.ok || !data.checkoutUrl) {
        setState({ status: 'error', message: data.error ?? 'Something went wrong. Please try again.' })
        return
      }
      setState({ status: 'success', checkoutUrl: data.checkoutUrl, mock: data.mock ?? false })
      if (!data.checkoutUrl.startsWith('#')) window.location.href = data.checkoutUrl
    } catch {
      setState({ status: 'error', message: 'Unable to reach the store. Check your connection and try again.' })
    }
  }, [])

  const reset = useCallback(() => setState({ status: 'idle' }), [])

  return { state, checkout, reset }
}
