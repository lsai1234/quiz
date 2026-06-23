'use client'

import { create } from 'zustand'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { MemberSubscription } from '@/lib/recharge/types'
import {
  createMockSubscription,
  setDispatchDay,
  pauseSubscription,
  resumeSubscription,
  cancelSubscription,
  swapSubscriptionLine,
} from '@/lib/recharge/mock'

/**
 * Subscriber-hub state. Today it drives a mock subscription; when Recharge is
 * connected, each action calls Recharge's customer API instead of the local
 * mock mutation — the action surface stays the same.
 */
interface HubStore {
  session: { email: string } | null
  subscription: MemberSubscription | null

  login: (email: string, catalogue: CatalogueProduct[]) => void
  logout: () => void

  setDispatchDay: (day: number) => void
  pause: () => void
  resume: () => void
  cancel: () => void
  swapLine: (lineId: string, newProduct: CatalogueProduct) => void
}

export const useHubStore = create<HubStore>((set) => ({
  session: null,
  subscription: null,

  login: (email, catalogue) =>
    set({ session: { email }, subscription: createMockSubscription(catalogue, email) }),
  logout: () => set({ session: null, subscription: null }),

  setDispatchDay: (day) =>
    set((s) => (s.subscription ? { subscription: setDispatchDay(s.subscription, day) } : s)),
  pause: () => set((s) => (s.subscription ? { subscription: pauseSubscription(s.subscription) } : s)),
  resume: () => set((s) => (s.subscription ? { subscription: resumeSubscription(s.subscription) } : s)),
  cancel: () => set((s) => (s.subscription ? { subscription: cancelSubscription(s.subscription) } : s)),
  swapLine: (lineId, newProduct) =>
    set((s) => (s.subscription ? { subscription: swapSubscriptionLine(s.subscription, lineId, newProduct) } : s)),
}))
