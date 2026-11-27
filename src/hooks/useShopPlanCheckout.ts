'use client'

import type { BasketRoutine } from '@/lib/basket/store'
import { releasePaidBasket, rememberBasketBeingPaid } from '@/lib/basket/paid'
import { useCallback, useRef, useState } from 'react'
import type { ResolvedBasketLine } from '@/lib/basket/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { CheckoutPayload } from '@/lib/checkout/types'
import type { ConsentSubmission, ConsentVersions } from '@/lib/legal/consent'
import { buildShopPlan } from '@/lib/checkout/shop-plan'
import { track } from '@/lib/analytics/events'

export type ShopPlanCheckoutState =
  | { status: 'idle' }
  | { status: 'loading' }
  /** The session exists and the browser is on its way to Stripe. Not a success. */
  | { status: 'redirecting' }
  | { status: 'error'; message: string }
  /** Not signed in: the account gate (which also takes the terms). */
  | { status: 'needs-account'; payload: CheckoutPayload }
  /** Signed in, but no current consent: the consent gate. */
  | { status: 'needs-consent'; payload: CheckoutPayload; versions: ConsentVersions | null; notice: string | null }
  /** Mock payments only: the plan is set up and there is no Stripe to go to. */
  | { status: 'mock-complete' }

/**
 * A shop basket, bought every month: the quiz plan's checkout, fed a basket.
 *
 * Same route (`POST /api/checkout/finalize`), same account gate, same consent
 * gate, same Stripe subscription. What differs is what is sent: the basket's
 * products and quantities (`shop.lines`), from which the SERVER builds and
 * prices the plan (`buildShopPlan`). The plan built here is a preview, so the
 * account gate can say what is being bought; the server throws it away.
 */
export function useShopPlanCheckout() {
  const [state, setState] = useState<ShopPlanCheckoutState>({ status: 'idle' })
  const pending = useRef<CheckoutPayload | null>(null)
  const inFlight = useRef(false)

  const submit = useCallback(async (payload: CheckoutPayload) => {
    if (inFlight.current) return
    inFlight.current = true
    setState({ status: 'loading' })
    try {
      const res = await fetch('/api/checkout/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.status === 401) {
        pending.current = payload
        setState({ status: 'needs-account', payload })
        return
      }
      const data: { checkoutUrl?: string; error?: string; code?: string; versions?: ConsentVersions; ref?: string } | null =
        await res.json().catch(() => null)
      if (!res.ok && (data?.code === 'not-accepted' || data?.code === 'stale-version')) {
        pending.current = payload
        setState({
          status: 'needs-consent',
          payload,
          versions: data.versions ?? null,
          notice: data.code === 'stale-version' ? data.error ?? null : null,
        })
        return
      }
      if (!res.ok || !data?.checkoutUrl) {
        track('checkout_error', { source: 'shop_plan', message: data?.error ?? `status ${res.status}` })
        const message = data?.error
          ?? (res.status >= 500
            ? `Something went wrong at our end (error ${res.status}). Your basket is safe. Please try again in a moment.`
            : `We couldn’t start your plan (error ${res.status}). Please try again.`)
        setState({ status: 'error', message: data?.ref ? `${message} Reference: ${data.ref}` : message })
        return
      }
      rememberBasketBeingPaid()
      if (data.checkoutUrl.startsWith('#')) {
        // Set up already (no live payments): the basket has been bought.
        releasePaidBasket()
        setState({ status: 'mock-complete' })
        return
      }
      setState({ status: 'redirecting' })
      window.location.href = data.checkoutUrl
    } catch {
      setState({ status: 'error', message: 'Unable to reach the store. Check your connection and try again.' })
    } finally {
      inFlight.current = false
    }
  }, [])

  /** Start the monthly checkout for this basket. */
  const checkout = useCallback(
    (resolved: ResolvedBasketLine[], catalogue: CatalogueProduct[], partnerCode: string | null, routine: BasketRoutine | null = null) => {
      const lines = resolved.map((l) => ({ productId: l.product.id, variantId: l.variant.id, quantity: l.quantity }))
      const shopRoutine = routine ? { ...routine, source: 'member' as const } : null
      const preview = buildShopPlan(lines, catalogue, undefined, undefined, shopRoutine)
      if (!preview.ok) {
        setState({ status: 'error', message: preview.message })
        return
      }
      track('checkout_start', { source: 'shop_plan', items: resolved.length, value: preview.monthly })
      void submit({
        subscription: preview.subscription,
        shop: { lines, routine: shopRoutine },
        ...(partnerCode ? { partnerCode } : {}),
      })
    },
    [submit],
  )

  /** Carry on after the gate: signed in, with the consent given there. */
  const resume = useCallback(
    (consent?: ConsentSubmission) => {
      if (!pending.current) return
      void submit(consent ? { ...pending.current, consent } : pending.current)
    },
    [submit],
  )

  const reset = useCallback(() => {
    pending.current = null
    setState({ status: 'idle' })
  }, [])

  return { state, checkout, resume, reset }
}
