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
import type { ConsentSubmission, ConsentVersions } from '@/lib/legal/consent'

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
   * Signed in, but this checkout carries no usable consent — the page shows the
   * ConsentGate. Signing up captures consent on the way through the account
   * gate; a member who was already signed in has never been asked, so the
   * server's refusal is what opens the box rather than what reports an error.
   */
  | { status: 'needs-consent'; payload: CheckoutPayload; versions: ConsentVersions | null; notice: string | null }
  /**
   * Mock payments only: no Stripe to go to, so the demo order is complete. Real
   * payments end at `redirecting` and confirm on `/order/confirmation`.
   */
  | { status: 'mock-complete'; plan: PlanType; subscription?: SubscriptionCheckout }

/** Transport failure — the request never got an answer. The ONLY case where
 *  telling someone to check their connection is honest. */
const OFFLINE_MESSAGE = 'Unable to reach the store. Check your connection and try again.'

/**
 * What to say when the server answered, but not with a checkout.
 *
 * Its own sentence, because "check your connection" for a 500 sends a member to
 * reboot their router over a fault that is entirely ours — and buries the one
 * detail that would let us find it.
 */
function serverErrorMessage(status: number, error?: string): string {
  if (error) return error
  if (status >= 500) {
    return `Something went wrong at our end (error ${status}) — your stack is saved. Please try again in a moment.`
  }
  return `We couldn’t start your checkout (error ${status}). Please try again.`
}

/**
 * The extra lines a failed checkout carries: the log reference, and — for a
 * founder signed into the portal — what actually broke.
 *
 * Shown rather than swallowed because the alternative is a founder testing
 * their own checkout on a phone, reading a sentence written for customers, and
 * having no way to tell a Stripe key problem from a database one.
 */
function failureDetail(data: { ref?: string; detail?: string } | null): string[] {
  const lines: string[] = []
  if (data?.detail) lines.push(data.detail)
  if (data?.ref) lines.push(`Reference: ${data.ref}`)
  return lines
}

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
      // Defensively: a 500 from a route handler comes back as an HTML error
      // page, and `res.json()` throwing on that used to land in the catch below
      // — telling a member with a perfectly good connection to check it, while
      // the real fault (ours) went unsaid. A response that ARRIVED is never a
      // connection problem.
      const data: {
        checkoutUrl?: string
        mock?: boolean
        error?: string
        code?: string
        versions?: ConsentVersions
        /** Log reference for a server-side failure. */
        ref?: string
        /** What broke — present only for a signed-in founder. */
        detail?: string
      } | null = await res.json().catch(() => null)
      // Consent is the one refusal the member can clear from here: ask for it
      // and re-submit, rather than showing a banner about a box that was never
      // on the screen. `stale-version` carries its own explanation — the terms
      // changed under them — so that sentence goes into the gate.
      if (!res.ok && (data?.code === 'not-accepted' || data?.code === 'stale-version')) {
        pending.current = { payload, checkout }
        setState({
          status: 'needs-consent',
          payload,
          versions: data.versions ?? null,
          notice: data.code === 'stale-version' ? data.error ?? null : null,
        })
        return
      }
      if (!res.ok || !data?.checkoutUrl) {
        // Keep the plan and the gate state, so "try again" doesn't mean
        // rebuilding the stack. The status goes in the message because a member
        // reporting "it says 500" tells us far more than "it didn't work".
        console.error(`[checkout] finalize failed (${res.status})`, data)
        setState({
          status: 'error',
          messages: [serverErrorMessage(res.status, data?.error), ...failureDetail(data)],
        })
        return
      }
      if (data.checkoutUrl.startsWith('#')) {
        setState({ status: 'mock-complete', plan: 'subscription', subscription: checkout })
        return
      }
      setState({ status: 'redirecting', plan: 'subscription' })
      window.location.href = data.checkoutUrl
    } catch (err) {
      console.error('[checkout] finalize could not be sent', err)
      setState({ status: 'error', messages: [OFFLINE_MESSAGE] })
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
        /** A partner's code, as applied on the review screen. Re-validated server-side. */
        partnerCode?: string | null
        /** Its rate, for the displayed totals only. The server decides the real one. */
        partnerDiscountPct?: number | null
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
          // Display only — the server re-validates the code and recomputes the
          // first month from its own numbers in `finalizeCheckout`.
          partnerDiscountPct: subOpts.partnerDiscountPct,
        })
        if (!result.ok) {
          setState({ status: 'error', messages: result.errors.map(validationErrorMessage) })
          return
        }
        const memberSubscription = buildMemberSubscription(blueprint, catalogue, '', answers, {
          usageByProductId: subOpts.usageByProductId,
          level: subOpts.level,
          introDiscountOverride: subOpts.introDiscountOverride,
          partnerDiscountPct: subOpts.partnerDiscountPct,
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
          partnerCode: subOpts.partnerCode ?? null,
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
          body: JSON.stringify({ lines: validation.lines, partnerCode: subOpts.partnerCode ?? null }),
        })
        const data: { checkoutUrl?: string; mock?: boolean; error?: string } | null =
          await res.json().catch(() => null)
        if (!res.ok || !data?.checkoutUrl) {
          console.error(`[checkout] cart failed (${res.status})`, data)
          setState({ status: 'error', messages: [serverErrorMessage(res.status, data?.error)] })
          return
        }
        if (data.checkoutUrl.startsWith('#')) {
          setState({ status: 'mock-complete', plan: 'oneoff' })
          return
        }
        setState({ status: 'redirecting', plan: 'oneoff' })
        window.location.href = data.checkoutUrl
      } catch (err) {
        console.error('[checkout] cart could not be sent', err)
        setState({ status: 'error', messages: [OFFLINE_MESSAGE] })
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
