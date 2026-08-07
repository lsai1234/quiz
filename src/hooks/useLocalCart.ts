'use client'

import { useCallback, useMemo, useState } from 'react'
import { MOCK_PRODUCTS } from '@/lib/mock-products'
import type { Product } from '@/lib/types'

/**
 * An in-memory cart for the scroll experience's bundle act.
 *
 * This replaces a hook that talked to Shopify's cart API. Shopify is gone —
 * products come from PowerBody and payment goes through Stripe — and that hook's
 * live branches had already been unreachable for a while, so what is left is
 * what was actually running: a cart held in component state, priced from the
 * catalogue, with a "checkout" that just shows the success screen.
 *
 * Deliberately NOT wired to Stripe. The scroll experience is a demo surface;
 * the real purchase paths are `useShopCheckout` and `useStackCheckout`. Pointing
 * this at live payment is a product decision, not a refactor, so it stays a
 * demo until someone makes that call.
 */

export interface LocalCartLine {
  id: string
  variantId: string
  quantity: number
  price: number
  title: string
  /** Why the recommender picked this, shown next to the line. */
  reason?: string
}

export interface LocalCart {
  lines: LocalCartLine[]
  total: number
}

export interface UseLocalCartReturn {
  cart: LocalCart | null
  isLoading: boolean
  addItem: (variantId: string, quantity?: number, reason?: string) => void
  removeItem: (lineId: string) => void
  updateQty: (lineId: string, quantity: number) => void
  checkout: () => void
  isCheckoutSuccess: boolean
  totalFormatted: string
}

/** Price and title for a variant, from the catalogue the demo runs on. */
function lookup(variantId: string): Pick<Product, 'name' | 'price'> {
  const product = MOCK_PRODUCTS.find((p) => p.variantId === variantId)
  return { name: product?.name ?? 'Product', price: product?.price ?? 29.99 }
}

export function useLocalCart(): UseLocalCartReturn {
  const [lines, setLines] = useState<LocalCartLine[]>([])
  const [isCheckoutSuccess, setIsCheckoutSuccess] = useState(false)

  const addItem = useCallback((variantId: string, quantity = 1, reason?: string) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.variantId === variantId)
      if (existing) {
        return prev.map((l) => (l.variantId === variantId ? { ...l, quantity: l.quantity + quantity } : l))
      }
      const { name, price } = lookup(variantId)
      return [...prev, { id: `line-${variantId}`, variantId, quantity, price, title: name, reason }]
    })
  }, [])

  const removeItem = useCallback((lineId: string) => {
    setLines((prev) => prev.filter((l) => l.id !== lineId))
  }, [])

  const updateQty = useCallback((lineId: string, quantity: number) => {
    // Zero means remove — otherwise a line sits in the cart contributing nothing.
    setLines((prev) =>
      quantity <= 0 ? prev.filter((l) => l.id !== lineId) : prev.map((l) => (l.id === lineId ? { ...l, quantity } : l)),
    )
  }, [])

  const checkout = useCallback(() => setIsCheckoutSuccess(true), [])

  const total = useMemo(() => lines.reduce((sum, l) => sum + l.price * l.quantity, 0), [lines])

  return {
    cart: lines.length > 0 ? { lines, total } : null,
    // Nothing here is asynchronous, but the shape is kept so the component reads
    // the same as the other checkout hooks.
    isLoading: false,
    addItem,
    removeItem,
    updateQty,
    checkout,
    isCheckoutSuccess,
    totalFormatted: `£${total.toFixed(2)}`,
  }
}
