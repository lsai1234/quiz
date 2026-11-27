'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { BasketLine } from './types'
import { addLine, setLineQty, removeLine, pruneBasket } from './helpers'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { TrainingFrequency, WeightBand } from '@/lib/types'

/** How the basket is bought: once, or every month (`lib/checkout/shop-plan`). */
export type BasketPlan = 'once' | 'monthly'

/**
 * What a monthly basket is sized from, when the shopper has told us (`PlanRoutine`
 * without its source): how many days a week they train, and their weight. Unset,
 * the plan is sized from our estimate and says so.
 */
export interface BasketRoutine {
  trainingFrequency: TrainingFrequency | null
  weightBand: WeightBand | null
}

interface BasketStore {
  lines: BasketLine[]
  plan: BasketPlan
  setPlan: (plan: BasketPlan) => void
  routine: BasketRoutine | null
  setRoutine: (routine: BasketRoutine | null) => void
  add: (productId: string, variantId: string, qty?: number) => void
  setQty: (productId: string, variantId: string, qty: number) => void
  remove: (productId: string, variantId: string) => void
  clear: () => void
  /**
   * Drop lines whose product or variant has left the catalogue.
   *
   * ONLY safe to call with a catalogue that has actually loaded — an empty
   * `products` means "not here yet", and pruning against it would empty a
   * perfectly good basket. The caller owns that check.
   */
  prune: (products: CatalogueProduct[]) => void
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
      plan: 'once',
      setPlan: (plan) => set({ plan }),
      routine: null,
      setRoutine: (routine) => set({ routine }),
      add: (productId, variantId, qty = 1) =>
        set((s) => ({ lines: addLine(s.lines, productId, variantId, qty) })),
      setQty: (productId, variantId, qty) =>
        set((s) => ({ lines: setLineQty(s.lines, productId, variantId, qty) })),
      remove: (productId, variantId) =>
        set((s) => ({ lines: removeLine(s.lines, productId, variantId) })),
      // An emptied basket starts again as a one-off.
      clear: () => set({ lines: [], plan: 'once' }),
      prune: (products) =>
        set((s) => {
          const lines = pruneBasket(s.lines, products)
          // Identity, not length: an unchanged array means no write, which is
          // what keeps this from looping against the persisted store.
          return lines === s.lines ? s : { lines }
        }),
    }),
    {
      name: 'chrgd-basket',
      version: 1,
      // Guard SSR: the client-component page still renders on the server, where
      // localStorage is absent — returning undefined disables persistence there.
      storage: createJSONStorage(() =>
        (typeof window !== 'undefined' ? window.localStorage : undefined) as Storage,
      ),
      partialize: (s) => ({ lines: s.lines, plan: s.plan, routine: s.routine }),
    },
  ),
)
