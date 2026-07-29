'use client'

import { useState, useCallback, useRef } from 'react'
import { isShopifyLive } from '@/lib/data-source'
import {
  validateCheckout,
  validationErrorMessage,
  buildSubscriptionCheckout,
} from '@/lib/stack-blueprint/checkout'
import type { CheckoutLineItem, ValidationError, SubscriptionCheckout } from '@/lib/stack-blueprint/checkout'
import type { StackBlueprint } from '@/lib/stack-blueprint'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { QuizAnswers, StackLevel } from '@/lib/types'
import type { UsageLevel } from '@/lib/stack-blueprint/pricing'
import type { PlanType } from '@/lib/store'
import { buildMemberSubscription } from '@/lib/recharge/mock'
import type { CheckoutPayload } from '@/lib/checkout/types'
import type { ConsentSubmission } from '@/lib/legal/consent'

export type CheckoutState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; messages: string[] }
  // Subscription checkout requires an account — the page shows the AccountGate.
  | { status: 'needs-account'; payload: CheckoutPayload }
  | { status: 'success'; plan: PlanType; checkoutUrl: string; mock: boolean; subscription?: SubscriptionCheckout }

/**
 * Validates and initiates checkout for a StackBlueprint, for either plan.
 *
 * One-off      → POST /api/cart → checkoutUrl → redirect.
 * Subscription → requires an account: builds the member's bundle, then
 *   POST /api/checkout/finalize (saves bundle + quiz, returns the payment URL).
 *   A 401 means "not signed in" → the page opens the AccountGate and calls
 *   `resume()` once the member authenticates.
 */
export function useStackCheckout() {
  const [state, setState] = useState<CheckoutState>({ status: 'idle' })
  // Held so the AccountGate's "resume" can re-submit the same order post-auth.
  const pending = useRef<{ payload: CheckoutPayload; checkout: SubscriptionCheckout } | null>(null)

  const runFinalize = useCallback(async (payload: CheckoutPayload, checkout: SubscriptionCheckout) => {
    setState({ status: 'loading' })
    try {
      const res = await fetch('/api/checkout/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.status === 401) {
        pending.current = { payload, checkout }
        setState({ status: 'needs-account', payload })
        return
      }
      const data: { checkoutUrl?: string; mock?: boolean; error?: string } = await res.json()
      if (!res.ok || !data.checkoutUrl) {
        setState({ status: 'error', messages: [data.error ?? 'Something went wrong. Please try again.'] })
        return
      }
      setState({ status: 'success', plan: 'subscription', checkoutUrl: data.checkoutUrl, mock: data.mock ?? false, subscription: checkout })
      if (!data.checkoutUrl.startsWith('#')) window.location.href = data.checkoutUrl
    } catch {
      setState({ status: 'error', messages: ['Unable to reach the store. Check your connection and try again.'] })
    }
  }, [])

  const checkout = useCallback(
    async (
      blueprint: StackBlueprint,
      catalogue: CatalogueProduct[],
      planType: PlanType = 'oneoff',
      answers?: QuizAnswers | null,
      subOpts: { usageByProductId?: Record<string, UsageLevel>; level?: StackLevel; introDiscountOverride?: number | null } = {},
    ) => {
      setState({ status: 'loading' })
      const live = isShopifyLive()

      // ── Subscription ── (account-gated; bundle + quiz persist to the account)
      if (planType === 'subscription') {
        const result = buildSubscriptionCheckout(blueprint, catalogue, answers, {
          requireShopifyIds: live,
          requireSellingPlans: live,
          usageByProductId: subOpts.usageByProductId,
          level: subOpts.level,
          introDiscountOverride: subOpts.introDiscountOverride,
        })
        if (!result.ok) {
          setState({ status: 'error', messages: result.errors.map(validationErrorMessage) })
          return
        }
        const memberSubscription = buildMemberSubscription(blueprint, catalogue, '', answers, {
          usageByProductId: subOpts.usageByProductId,
          level: subOpts.level,
          introDiscountOverride: subOpts.introDiscountOverride,
          id: `sub-${Date.now()}`,
        })
        const payload: CheckoutPayload = {
          subscription: memberSubscription,
          quiz: answers ? { answers, level: subOpts.level } : null,
          lines: live ? result.checkout.lines : [],
        }
        await runFinalize(payload, result.checkout)
        return
      }

      // ── One-off ──
      const validation = validateCheckout(blueprint, catalogue, { requireShopifyIds: live })
      if (!validation.ok) {
        setState({ status: 'error', messages: validation.errors.map(validationErrorMessage) })
        return
      }
      if (!live) {
        setState({ status: 'success', plan: 'oneoff', checkoutUrl: '#mock-checkout', mock: true })
        return
      }
      try {
        const res = await fetch('/api/cart', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lines: validation.lines }),
        })
        const data: { checkoutUrl?: string; mock?: boolean; error?: string } = await res.json()
        if (!res.ok || !data.checkoutUrl) {
          setState({ status: 'error', messages: [data.error ?? 'Something went wrong. Please try again.'] })
          return
        }
        setState({ status: 'success', plan: 'oneoff', checkoutUrl: data.checkoutUrl, mock: data.mock ?? false })
        if (data.checkoutUrl && !data.checkoutUrl.startsWith('#')) window.location.href = data.checkoutUrl
      } catch {
        setState({ status: 'error', messages: ['Unable to reach the store. Check your connection and try again.'] })
      }
    },
    [runFinalize],
  )

  /**
   * Re-run the subscription finalize after the member signs in via the gate,
   * carrying the consent they gave there — the server rejects a checkout
   * without it.
   */
  const resume = useCallback(
    (consent?: ConsentSubmission) => {
      if (!pending.current) return
      const payload = consent ? { ...pending.current.payload, consent } : pending.current.payload
      void runFinalize(payload, pending.current.checkout)
    },
    [runFinalize],
  )

  const reset = useCallback(() => { pending.current = null; setState({ status: 'idle' }) }, [])

  return { state, checkout, resume, reset }
}

export type { ValidationError, CheckoutLineItem }
