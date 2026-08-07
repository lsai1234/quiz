'use client'

import { useState, useCallback } from 'react'
import type { ShopifyCart, CartLineItem } from '@/lib/shopify/types'
import {
  createCart, addCartLines, updateCartLines, removeCartLines,
  buildMockCart,
} from '@/lib/shopify/operations'

interface UseShopifyCartReturn {
  cart: ShopifyCart | null
  isLoading: boolean
  isMockMode: boolean
  addItem: (variantId: string, quantity?: number, reason?: string) => Promise<void>
  removeItem: (lineId: string) => Promise<void>
  updateQty: (lineId: string, quantity: number) => Promise<void>
  checkout: () => Promise<void>
  isCheckoutSuccess: boolean
  totalFormatted: string
}

export function useShopifyCart(): UseShopifyCartReturn {
  const [cart, setCart] = useState<ShopifyCart | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isCheckoutSuccess, setIsCheckoutSuccess] = useState(false)
  const [pendingReasons, setPendingReasons] = useState<Record<string, string>>({})

  // Always the local cart now.
  //
  // This used to follow the data source: mock built a cart in memory, "live"
  // created a Shopify cart and handed off to Shopify checkout. Shopify is no
  // longer the catalogue or the checkout — products come from PowerBody and
  // payment goes through Stripe (`useShopCheckout` / `useStackCheckout`) — so
  // the Shopify branches below are unreachable and the local cart is the only
  // one. Pinned here rather than deleted piecemeal so the hook keeps one
  // obvious seam when this component is moved onto the Stripe basket.
  const isMockMode = true

  // ─── Mock helpers ──────────────────────────────────────────────────────────

  function rebuildMockCart(
    lines: { variantId: string; quantity: number; reason?: string }[],
  ): ShopifyCart {
    const c = buildMockCart(lines.map(({ variantId, quantity }) => ({ variantId, quantity })))
    c.lines = c.lines.map((l, i) => ({ ...l, reason: lines[i]?.reason }))
    return c
  }

  // ─── addItem ──────────────────────────────────────────────────────────────

  const addItem = useCallback(async (variantId: string, quantity = 1, reason?: string) => {
    setIsLoading(true)
    try {
      if (isMockMode) {
        setCart((prev) => {
          const existing = prev?.lines ?? []
          const alreadyIn = existing.find((l) => l.variantId === variantId)
          const newLines = alreadyIn
            ? existing.map((l) => l.variantId === variantId ? { ...l, quantity: l.quantity + quantity } : l)
            : [...existing, { id: `mock-${variantId}`, variantId, quantity, variant: {} as CartLineItem['variant'], reason }]
          return rebuildMockCart(newLines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, reason: l.reason })))
        })
        if (reason) setPendingReasons((r) => ({ ...r, [variantId]: reason }))
        return
      }

      const line = { merchandiseId: variantId, quantity }
      if (!cart) {
        const newCart = await createCart([line])
        setCart(newCart)
      } else {
        const updated = await addCartLines(cart.id, [line])
        setCart(updated)
      }
    } finally {
      setIsLoading(false)
    }
  }, [cart, isMockMode])

  // ─── removeItem ───────────────────────────────────────────────────────────

  const removeItem = useCallback(async (lineId: string) => {
    setIsLoading(true)
    try {
      if (isMockMode) {
        setCart((prev) => {
          if (!prev) return null
          const newLines = prev.lines.filter((l) => l.id !== lineId)
          return rebuildMockCart(newLines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, reason: l.reason })))
        })
        return
      }
      if (!cart) return
      const updated = await removeCartLines(cart.id, [lineId])
      setCart(updated)
    } finally {
      setIsLoading(false)
    }
  }, [cart, isMockMode])

  // ─── updateQty ────────────────────────────────────────────────────────────

  const updateQty = useCallback(async (lineId: string, quantity: number) => {
    if (quantity <= 0) { removeItem(lineId); return }
    setIsLoading(true)
    try {
      if (isMockMode) {
        setCart((prev) => {
          if (!prev) return null
          const newLines = prev.lines.map((l) => l.id === lineId ? { ...l, quantity } : l)
          return rebuildMockCart(newLines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, reason: l.reason })))
        })
        return
      }
      if (!cart) return
      const updated = await updateCartLines(cart.id, [{ id: lineId, quantity }])
      setCart(updated)
    } finally {
      setIsLoading(false)
    }
  }, [cart, isMockMode, removeItem])

  // ─── checkout ─────────────────────────────────────────────────────────────

  const checkout = useCallback(async () => {
    if (isMockMode) {
      setIsCheckoutSuccess(true)
      return
    }
    if (cart?.checkoutUrl) {
      window.location.href = cart.checkoutUrl
    }
  }, [cart, isMockMode])

  // ─── helpers ──────────────────────────────────────────────────────────────

  const total = parseFloat(cart?.estimatedCost.totalAmount.amount ?? '0')
  const currency = cart?.estimatedCost.totalAmount.currencyCode ?? 'GBP'
  const totalFormatted = `£${total.toFixed(2)}`

  return { cart, isLoading, isMockMode, addItem, removeItem, updateQty, checkout, isCheckoutSuccess, totalFormatted }
}
