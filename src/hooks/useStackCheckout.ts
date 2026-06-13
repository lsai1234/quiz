'use client'

import { useState, useCallback } from 'react'
import { SHOPIFY_LIVE } from '@/lib/shopify/client'
import { validateCheckout, validationErrorMessage } from '@/lib/stack-blueprint/checkout'
import type { CheckoutLineItem, ValidationError } from '@/lib/stack-blueprint/checkout'
import type { StackBlueprint } from '@/lib/stack-blueprint'
import type { CatalogueProduct } from '@/lib/catalogue/types'

export type CheckoutState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; messages: string[] }
  | { status: 'success'; checkoutUrl: string; mock: boolean }

/**
 * Validates and initiates checkout for a StackBlueprint.
 *
 * In live mode: POSTs to /api/cart → receives checkoutUrl → redirects.
 * In mock mode: validates, then sets success state without redirecting.
 */
export function useStackCheckout() {
  const [state, setState] = useState<CheckoutState>({ status: 'idle' })

  const checkout = useCallback(
    async (blueprint: StackBlueprint, catalogue: CatalogueProduct[]) => {
      setState({ status: 'loading' })

      // Validate — in mock mode we don't require Shopify GIDs
      const validation = validateCheckout(blueprint, catalogue, {
        requireShopifyIds: SHOPIFY_LIVE,
      })

      if (!validation.ok) {
        setState({
          status: 'error',
          messages: validation.errors.map(validationErrorMessage),
        })
        return
      }

      if (!SHOPIFY_LIVE) {
        // Mock checkout — show success without hitting the API
        setState({ status: 'success', checkoutUrl: '#mock-checkout', mock: true })
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
          setState({
            status: 'error',
            messages: [data.error ?? 'Something went wrong. Please try again.'],
          })
          return
        }

        setState({ status: 'success', checkoutUrl: data.checkoutUrl, mock: data.mock ?? false })

        if (data.checkoutUrl && data.checkoutUrl !== '#mock-checkout') {
          window.location.href = data.checkoutUrl
        }
      } catch {
        setState({
          status: 'error',
          messages: ['Unable to reach the store. Check your connection and try again.'],
        })
      }
    },
    [],
  )

  const reset = useCallback(() => setState({ status: 'idle' }), [])

  return { state, checkout, reset }
}

export type { ValidationError, CheckoutLineItem }
