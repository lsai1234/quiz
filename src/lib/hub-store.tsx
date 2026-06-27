'use client'

import { create } from 'zustand'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { MemberSubscription } from '@/lib/recharge/types'
import type { FeedbackCheckIn, FeedbackDimension } from '@/lib/feedback'
import {
  createMockSubscription,
  setDispatchDay,
  pauseSubscription,
  resumeSubscription,
  cancelSubscription,
  swapSubscriptionLine,
  addLine as addLineMutation,
  removeLine as removeLineMutation,
  setLineCadence as setLineCadenceMutation,
  setLineQuantity as setLineQuantityMutation,
  skipNextDelivery as skipNextMutation,
  setNextDispatchDate as setNextDispatchDateMutation,
  sendNow as sendNowMutation,
  bringForward as bringForwardMutation,
  delayDispatch as delayDispatchMutation,
} from '@/lib/recharge/mock'
import {
  skipDelivery as skipDeliveryMutation,
  unskipDelivery as unskipDeliveryMutation,
  rescheduleDelivery as rescheduleDeliveryMutation,
  addItemToDelivery as addItemToDeliveryMutation,
  removeItemFromDelivery as removeItemFromDeliveryMutation,
} from '@/lib/recharge/schedule'
import type { DeliveryItem } from '@/lib/recharge/schedule'

/**
 * Subscriber-hub state. Today it drives a mock subscription; when Recharge is
 * connected, each action calls Recharge's customer API instead of the local
 * mock mutation — the action surface stays the same.
 */
interface HubStore {
  session: { email: string } | null
  subscription: MemberSubscription | null
  feedback: FeedbackCheckIn[]

  login: (email: string, catalogue: CatalogueProduct[]) => void
  logout: () => void
  submitFeedback: (
    ratings: Partial<Record<FeedbackDimension, number>>,
    noticedImprovements: boolean,
    notes?: string,
  ) => void

  setDispatchDay: (day: number) => void
  pause: () => void
  resume: () => void
  cancel: () => void
  swapLine: (lineId: string, newProduct: CatalogueProduct) => void

  // Flexibility: add / remove / cadence / skip / next-box date
  addLine: (product: CatalogueProduct, catalogue: CatalogueProduct[]) => void
  removeLine: (lineId: string) => void
  setLineCadence: (lineId: string, months: number) => void
  setLineQuantity: (lineId: string, quantity: number) => void
  skipNext: (lineId: string) => void
  setNextDispatchDate: (date: Date) => void
  sendNow: () => void
  bringForward: (days: number) => void
  delayDispatch: (days: number) => void

  // Calendar: per-delivery edits
  skipDelivery: (deliveryId: string) => void
  unskipDelivery: (deliveryId: string) => void
  rescheduleDelivery: (deliveryId: string, date: Date) => void
  addItemToDelivery: (deliveryId: string, product: CatalogueProduct) => void
  removeItemFromDelivery: (deliveryId: string, item: DeliveryItem) => void

  /** Log a single-dimension micro check-in (the inline "feeling it?" tap). */
  submitDimension: (dimension: FeedbackDimension, rating: number) => void
}

export const useHubStore = create<HubStore>((set) => ({
  session: null,
  subscription: null,
  feedback: [],

  login: (email, catalogue) =>
    set({ session: { email }, subscription: createMockSubscription(catalogue, email), feedback: [] }),
  logout: () => set({ session: null, subscription: null, feedback: [] }),
  submitFeedback: (ratings, noticedImprovements, notes) =>
    set((s) => ({
      feedback: [
        ...s.feedback,
        { id: `fb-${Date.now()}`, date: new Date().toISOString(), ratings, noticedImprovements, notes },
      ],
    })),

  setDispatchDay: (day) =>
    set((s) => (s.subscription ? { subscription: setDispatchDay(s.subscription, day) } : s)),
  pause: () => set((s) => (s.subscription ? { subscription: pauseSubscription(s.subscription) } : s)),
  resume: () => set((s) => (s.subscription ? { subscription: resumeSubscription(s.subscription) } : s)),
  cancel: () => set((s) => (s.subscription ? { subscription: cancelSubscription(s.subscription) } : s)),
  swapLine: (lineId, newProduct) =>
    set((s) => (s.subscription ? { subscription: swapSubscriptionLine(s.subscription, lineId, newProduct) } : s)),

  addLine: (product, catalogue) =>
    set((s) => (s.subscription ? { subscription: addLineMutation(s.subscription, product, catalogue) } : s)),
  removeLine: (lineId) =>
    set((s) => (s.subscription ? { subscription: removeLineMutation(s.subscription, lineId).sub } : s)),
  setLineCadence: (lineId, months) =>
    set((s) => (s.subscription ? { subscription: setLineCadenceMutation(s.subscription, lineId, months) } : s)),
  setLineQuantity: (lineId, quantity) =>
    set((s) => (s.subscription ? { subscription: setLineQuantityMutation(s.subscription, lineId, quantity) } : s)),
  skipNext: (lineId) =>
    set((s) => (s.subscription ? { subscription: skipNextMutation(s.subscription, lineId) } : s)),
  setNextDispatchDate: (date) =>
    set((s) => (s.subscription ? { subscription: setNextDispatchDateMutation(s.subscription, date) } : s)),
  sendNow: () => set((s) => (s.subscription ? { subscription: sendNowMutation(s.subscription) } : s)),
  bringForward: (days) =>
    set((s) => (s.subscription ? { subscription: bringForwardMutation(s.subscription, days) } : s)),
  delayDispatch: (days) =>
    set((s) => (s.subscription ? { subscription: delayDispatchMutation(s.subscription, days) } : s)),

  skipDelivery: (deliveryId) =>
    set((s) => (s.subscription ? { subscription: skipDeliveryMutation(s.subscription, deliveryId) } : s)),
  unskipDelivery: (deliveryId) =>
    set((s) => (s.subscription ? { subscription: unskipDeliveryMutation(s.subscription, deliveryId) } : s)),
  rescheduleDelivery: (deliveryId, date) =>
    set((s) => (s.subscription ? { subscription: rescheduleDeliveryMutation(s.subscription, deliveryId, date) } : s)),
  addItemToDelivery: (deliveryId, product) =>
    set((s) => (s.subscription ? { subscription: addItemToDeliveryMutation(s.subscription, deliveryId, product) } : s)),
  removeItemFromDelivery: (deliveryId, item) =>
    set((s) => (s.subscription ? { subscription: removeItemFromDeliveryMutation(s.subscription, deliveryId, item) } : s)),

  submitDimension: (dimension, rating) =>
    set((s) => ({
      feedback: [
        ...s.feedback,
        { id: `fb-${Date.now()}`, date: new Date().toISOString(), ratings: { [dimension]: rating }, noticedImprovements: rating >= 4 },
      ],
    })),
}))
