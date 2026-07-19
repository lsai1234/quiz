'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { BasketLine } from './types'
import { addLine, setLineQty, removeLine } from './helpers'

interface BasketStore {
  lines: BasketLine[]
  add: (productId: string, variantId: string, qty?: number) => void
  setQty: (productId: string, variantId: string, qty: number) => void
  remove: (productId: string, variantId: string) => void
  clear: () => void
}

/**
 * The shop basket — a small, persisted store kept entirely separate from the
 * quiz store so the funnel carries none of the risk. Only the lightweight lines
 * are persisted (see BasketLine); product data is joined on read. Mutations
 * delegate to the pure helpers so the logic is unit-tested independently.
 */
export const useBasket = create<BasketStore>()(
  persist(
    (set) => ({
      lines: [],
      add: (productId, variantId, qty = 1) =>
        set((s) => ({ lines: addLine(s.lines, productId, variantId, qty) })),
      setQty: (productId, variantId, qty) =>
        set((s) => ({ lines: setLineQty(s.lines, productId, variantId, qty) })),
      remove: (productId, variantId) =>
        set((s) => ({ lines: removeLine(s.lines, productId, variantId) })),
      clear: () => set({ lines: [] }),
    }),
    {
      name: 'chrgd-basket',
      version: 1,
      // Guard SSR: the client-component page still renders on the server, where
      // localStorage is absent — returning undefined disables persistence there.
      storage: createJSONStorage(() =>
        (typeof window !== 'undefined' ? window.localStorage : undefined) as Storage,
      ),
      partialize: (s) => ({ lines: s.lines }),
    },
  ),
)
