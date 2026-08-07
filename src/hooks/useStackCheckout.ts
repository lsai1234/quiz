'use client'

import { useState, useCallback, useRef } from 'react'
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
import { safetyConstraintsFrom } from '@/lib/changes/safety'
import type { ChangePolicy } from '@/lib/recharge/types'
import type { CheckoutPayload } from '@/lib/checkout/types'
import type { ConsentSubmission } from '@/lib/legal/consent'

export type CheckoutState =
  | { status: 'idle' }
  /** Creating the Checkout Session. Nothing has been bought yet. */
  | { status: 'loading' }
  /**
   * The session exists and the browser is navigating to Stripe.
   *
   * Its own state, and NOT a success state (OC-F-002). This used to be
   * `success`, so `CheckoutSuccess` — "Your stack is on its way" — rendered for
   * the whole length of the redirect, before the customer had paid a penny.
   * Copy here may name the destination, never the outcome.
   */
  | { status: 'redirecting'; plan: PlanType }
  | { status: 'error'; messages: string[] }
  // Subscription checkout requires an account — the page shows the AccountGate.
  | { status: 'needs-account'; payload: CheckoutPayload }
  /**
   * Mock payments only: no Stripe to go to, so the demo order is complete. Real
   * payments end at `redirecting` and confirm on `/order/confirmation`.
   */
  | { status: 'mock-complete'; plan: PlanType; subscription?: SubscriptionCheckout }

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
      if (data.checkoutUrl.startsWith('#')) {
        setState({ status: 'mock-complete', plan: 'subscription', subscription: checkout })
        return
      }
      setState({ status: 'redirecting', plan: 'subscription' })
      window.location.href = data.checkoutUrl
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
      subOpts: {
        usageByProductId?: Record<string, UsageLevel>
        level?: StackLevel
        introDiscountOverride?: number | null
        /** The member's "what if this becomes unavailable?" answer from the journey. */
        defaultChangePolicy?: ChangePolicy
        changePolicyByProductId?: Record<string, ChangePolicy>
      } = {},
    ) => {
      setState({ status: 'loading' })

      // ── Subscription ── (account-gated; bundle + quiz persist to the account)
      if (planType === 'subscription') {
        // Payment goes through Stripe from server-resolved prices, so a variant
        // needs nothing beyond its own id to be sellable.
        const result = buildSubscriptionCheckout(blueprint, catalogue, answers, {
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
          defaultChangePolicy: subOpts.defaultChangePolicy,
          changePolicyByProductId: subOpts.changePolicyByProductId,
          // Snapshot the member's hard exclusions with the plan. The server
          // re-derives this too (finalize.ts) — belt and braces on the one thing
          // that must not be wrong when we swap a product for them later.
          safetyConstraints: safetyConstraintsFrom(answers),
          id: `sub-${Date.now()}`,
        })
        const payload: CheckoutPayload = {
          subscription: memberSubscription,
          quiz: answers ? { answers, level: subOpts.level } : null,
        }
        await runFinalize(payload, result.checkout)
        return
      }

      // ── One-off ──
      // Validation checks the stack is sellable (a variant exists and is in
      // stock); the SERVER prices it and decides Stripe-vs-mock. The old
      // `if (!live) return mock` short-circuit here is what made one-off Stripe
      // checkout unreachable under the shipping default.
      const validation = validateCheckout(blueprint, catalogue)
      if (!validation.ok) {
        setState({ status: 'error', messages: validation.errors.map(validationErrorMessage) })
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
        if (data.checkoutUrl.startsWith('#')) {
          setState({ status: 'mock-complete', plan: 'oneoff' })
          return
        }
        setState({ status: 'redirecting', plan: 'oneoff' })
        window.location.href = data.checkoutUrl
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
