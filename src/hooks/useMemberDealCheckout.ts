'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { track } from '@/lib/analytics/events'
import type { PublicBox } from '@/lib/deals/box'

/**
 * Buying a member's top-up box: their own deals, straight to payment.
 * `/api/cart` checks they're signed in and the deals are theirs and open,
 * prices the box again, and refuses to charge more than was shown.
 */
export type MemberDealCheckoutState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'redirecting' }
  | { status: 'error'; message: string }
  | { status: 'changed'; message: string; box: PublicBox | null }

const TIMEOUT_MS = 10_000

export function useMemberDealCheckout() {
  const [state, setState] = useState<MemberDealCheckoutState>({ status: 'idle' })
  const inFlight = useRef(false)

  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return
      inFlight.current = false
      setState({ status: 'idle' })
    }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [])

  const buy = useCallback(async (box: PublicBox) => {
    if (inFlight.current) return
    inFlight.current = true
    setState({ status: 'loading' })
    track('checkout_start', { source: 'hub_deal', items: box.lines.length, value: box.total })
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const res = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          lines: box.lines.map((l) => ({ variantId: l.variantId, quantity: 1, attributes: [{ key: 'source', value: 'hub-deal' }, { key: 'product', value: l.title }] })),
          memberDeal: { expectedTotal: box.total },
        }),
      })
      const data: { checkoutUrl?: string; orderId?: string; error?: string; offerChanged?: boolean; box?: PublicBox } | null = await res.json().catch(() => null)
      if (res.status === 409 && data?.offerChanged) {
        setState({ status: 'changed', message: data.error ?? 'This box has changed.', box: data.box ?? null })
        return
      }
      if (!res.ok || !data?.checkoutUrl) {
        setState({ status: 'error', message: data?.error ?? 'We couldn’t start your checkout. Please try again.' })
        return
      }
      setState({ status: 'redirecting' })
      window.location.href = data.checkoutUrl.startsWith('#') && data.orderId ? `/order/confirmation?order=${encodeURIComponent(data.orderId)}` : data.checkoutUrl
    } catch {
      setState({ status: 'error', message: controller.signal.aborted ? 'That took too long. Please try again.' : 'Unable to reach the store. Check your connection and try again.' })
    } finally {
      window.clearTimeout(timer)
      inFlight.current = false
    }
  }, [])

  return { state, buy, reset: useCallback(() => setState({ status: 'idle' }), []) }
}
