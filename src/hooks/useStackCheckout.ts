'use client'

import { useState, useCallback } from 'react'
import { isShopifyLive } from '@/lib/data-source'
import {
  validateCheckout,
  validationErrorMessage,
  buildSubscriptionCheckout,
} from '@/lib/stack-blueprint/checkout'
import type { CheckoutLineItem, ValidationError, SubscriptionCheckout } from '@/lib/stack-blueprint/checkout'
import type { StackBlueprint } from '@/lib/stack-blueprint'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { QuizAnswers } from '@/lib/types'
import type { PlanType } from '@/lib/store'

export type CheckoutState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; messages: string[] }
  | { status: 'success'; plan: PlanType; checkoutUrl: string; mock: boolean; subscription?: SubscriptionCheckout }

/**
 * Validates and initiates checkout for a StackBlueprint, for either plan.
 *
 * One-off  → POST /api/cart → checkoutUrl → redirect.
 * Subscribe → POST /api/subscribe (cart with selling plans) → checkoutUrl → redirect.
 * In mock mode both validate, then show a success state without redirecting.
 */
export function useStackCheckout() {
  const [state, setState] = useState<CheckoutState>({ status: 'idle' })

  const checkout = useCallback(
    async (
      blueprint: StackBlueprint,
      catalogue: CatalogueProduct[],
      planType: PlanType = 'oneoff',
      answers?: QuizAnswers | null,
    ) => {
      setState({ status: 'loading' })
      const live = isShopifyLive()

      // ── Subscription ──
      if (planType === 'subscription') {
        const result = buildSubscriptionCheckout(blueprint, catalogue, answers, {
          requireShopifyIds: live,
          requireSellingPlans: live,
        })
        if (!result.ok) {
          setState({ status: 'error', messages: result.errors.map(validationErrorMessage) })
          return
        }
        if (!live) {
          setState({ status: 'success', plan: 'subscription', checkoutUrl: '#mock-subscription', mock: true, subscription: result.checkout })
          return
        }
        try {
          const res = await fetch('/api/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lines: result.checkout.lines }),
          })
          const data: { checkoutUrl?: string; error?: string } = await res.json()
          if (!res.ok || !data.checkoutUrl) {
            setState({ status: 'error', messages: [data.error ?? 'Something went wrong. Please try again.'] })
            return
          }
          setState({ status: 'success', plan: 'subscription', checkoutUrl: data.checkoutUrl, mock: false, subscription: result.checkout })
          if (data.checkoutUrl && !data.checkoutUrl.startsWith('#')) window.location.href = data.checkoutUrl
        } catch {
          setState({ status: 'error', messages: ['Unable to reach the store. Check your connection and try again.'] })
        }
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
    [],
  )

  const reset = useCallback(() => setState({ status: 'idle' }), [])

  return { state, checkout, reset }
}

export type { ValidationError, CheckoutLineItem }
