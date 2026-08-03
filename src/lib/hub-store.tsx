'use client'

import { create } from 'zustand'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { UsageLevel } from '@/lib/stack-blueprint/pricing'
import type { ChangePolicy, MemberSubscription } from '@/lib/recharge/types'
import {
  setLineChangePolicy as setLineChangePolicyMutation,
  setDefaultChangePolicy as setDefaultChangePolicyMutation,
} from '@/lib/changes/policy'
import type { FeedbackCheckIn, FeedbackDimension } from '@/lib/feedback'
import {
  setDispatchDay,
  pauseSubscription,
  resumeSubscription,
  cancelSubscription,
  snoozeSubscription,
  swapSubscriptionLine,
  addLine as addLineMutation,
  removeLine as removeLineMutation,
  setLineCadence as setLineCadenceMutation,
  setLineQuantity as setLineQuantityMutation,
  setLineUsage as setLineUsageMutation,
  setLineSubstitution as setLineSubstitutionMutation,
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
 * Subscriber-hub state, backed by a real account. Sign-in is a DB session
 * (email+password or Google — see /api/auth/*); the subscription and check-in
 * history persist per account in the app database. Mutations stay pure local
 * functions, and each result is written through to /api/hub/subscription so
 * the state survives reloads and devices. When Recharge is connected, each
 * action calls Recharge's customer API instead — the action surface stays
 * the same.
 */

export interface HubSession {
  email: string
  name: string
}

/**
 * Write the mutated subscription through to the account.
 *
 * Optimistic — the local state has already moved and this returns it unchanged,
 * because every one of these mutations is instant and reversible in the UI.
 *
 * What it can no longer do is fail in silence. The save now also pushes the
 * change to Stripe and answers 502 with NOTHING saved if Stripe refuses, so a
 * swallowed rejection would leave someone looking at a plan and a price that
 * their card knows nothing about. On failure we reload the stored truth and
 * surface a message.
 */
function persist(subscription: MemberSubscription): MemberSubscription {
  void (async () => {
    try {
      const res = await fetch('/api/hub/subscription', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription }),
      })
      if (res.ok) return
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      useHubStore.setState({
        saveError: data.error ?? 'We couldn’t save that change. Please try again.',
      })
      // Pull back what's actually stored so the screen stops showing a change
      // that didn't happen.
      await useHubStore.getState().refresh()
    } catch {
      useHubStore.setState({
        saveError: 'We couldn’t reach your account. Check your connection and try again.',
      })
    }
  })()
  return subscription
}

function persistCheckIn(checkIn: FeedbackCheckIn): FeedbackCheckIn {
  void fetch('/api/hub/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ checkIn }),
  }).catch(() => {})
  return checkIn
}

interface HubStore {
  session: HubSession | null
  subscription: MemberSubscription | null
  feedback: FeedbackCheckIn[]
  /** True once the initial /api/auth/me restore has completed. */
  hydrated: boolean
  /** OAuth providers the server has configured (which buttons to show). */
  providers: { id: string; label: string }[]
  /**
   * Set when a write-through failed and the local state has been rolled back to
   * what is actually stored. The hub shows it and clears it — a mutation that
   * silently didn't happen is worse than one that visibly didn't.
   */
  saveError: string | null

  /** Restore the signed-in state on load (cookie session → account data). */
  hydrate: () => Promise<void>
  /** Re-read the stored subscription — used to roll back after a failed save. */
  refresh: () => Promise<void>
  clearSaveError: () => void
  /** Sign in or create an account. Resolves to an error message, or null on success. */
  authenticate: (mode: 'login' | 'signup', email: string, password: string) => Promise<string | null>
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

  // Retention / save flow
  snooze: (months: number) => void
  applyDownsize: (dropLineIds: string[]) => void
  cancelWithReason: (reason: string) => void

  // Flexibility: add / remove / cadence / skip / next-box date
  addLine: (product: CatalogueProduct, catalogue: CatalogueProduct[]) => void
  removeLine: (lineId: string) => void
  setLineCadence: (lineId: string, months: number) => void
  setLineQuantity: (lineId: string, quantity: number) => void
  setLineUsage: (lineId: string, product: CatalogueProduct, usageLevel: UsageLevel) => void
  /**
   * Allow / disallow a same-category substitution for a line if it goes out of stock.
   * @deprecated Use `setLineChangePolicy` — this only speaks the old boolean.
   */
  setLineSubstitution: (lineId: string, allow: boolean) => void
  /** What to do with one line if its product becomes unavailable. */
  setLineChangePolicy: (lineId: string, policy: ChangePolicy) => void
  /** The plan-wide default, applied to lines the member hasn't set individually. */
  setDefaultChangePolicy: (policy: ChangePolicy) => void
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

/** Fetch the account's subscription + feedback (server seeds on first sign-in). */
async function loadAccountData(): Promise<{
  subscription: MemberSubscription | null
  feedback: FeedbackCheckIn[]
}> {
  try {
    const res = await fetch('/api/hub/subscription')
    if (!res.ok) return { subscription: null, feedback: [] }
    const data = (await res.json()) as { subscription?: MemberSubscription; feedback?: FeedbackCheckIn[] }
    return { subscription: data.subscription ?? null, feedback: data.feedback ?? [] }
  } catch {
    return { subscription: null, feedback: [] }
  }
}

export const useHubStore = create<HubStore>((set) => ({
  session: null,
  subscription: null,
  feedback: [],
  hydrated: false,
  providers: [],
  saveError: null,

  refresh: async () => {
    const { subscription, feedback } = await loadAccountData()
    if (subscription) set({ subscription, feedback })
  },

  clearSaveError: () => set({ saveError: null }),

  hydrate: async () => {
    try {
      const me = (await (await fetch('/api/auth/me')).json()) as {
        user?: { email: string | null; name: string } | null
        providers?: { id: string; label: string }[]
      }
      const providers = me.providers ?? []
      if (!me.user) {
        set({ hydrated: true, providers })
        return
      }
      const { subscription, feedback } = await loadAccountData()
      set({
        session: { email: me.user.email ?? '', name: me.user.name },
        subscription,
        feedback,
        hydrated: true,
        providers,
      })
    } catch {
      set({ hydrated: true })
    }
  },

  authenticate: async (mode, email, password) => {
    try {
      const res = await fetch(`/api/auth/${mode === 'signup' ? 'signup' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = (await res.json()) as { user?: { email: string | null; name: string }; error?: string }
      if (!res.ok || !data.user) return data.error ?? 'Something went wrong — try again'
      const { subscription, feedback } = await loadAccountData()
      set({ session: { email: data.user.email ?? '', name: data.user.name }, subscription, feedback })
      return null
    } catch {
      return 'Network error — try again'
    }
  },

  logout: () => {
    void fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    set({ session: null, subscription: null, feedback: [] })
  },

  submitFeedback: (ratings, noticedImprovements, notes) =>
    set((s) => ({
      feedback: [
        ...s.feedback,
        persistCheckIn({
          id: `fb-${Date.now()}`,
          date: new Date().toISOString(),
          ratings,
          noticedImprovements,
          notes,
        }),
      ],
    })),

  setDispatchDay: (day) =>
    set((s) => (s.subscription ? { subscription: persist(setDispatchDay(s.subscription, day)) } : s)),
  pause: () => set((s) => (s.subscription ? { subscription: persist(pauseSubscription(s.subscription)) } : s)),
  resume: () => set((s) => (s.subscription ? { subscription: persist(resumeSubscription(s.subscription)) } : s)),
  cancel: () => set((s) => (s.subscription ? { subscription: persist(cancelSubscription(s.subscription)) } : s)),
  swapLine: (lineId, newProduct) =>
    set((s) => (s.subscription ? { subscription: persist(swapSubscriptionLine(s.subscription, lineId, newProduct)) } : s)),

  snooze: (months) =>
    set((s) => (s.subscription ? { subscription: persist(snoozeSubscription(s.subscription, months)) } : s)),
  applyDownsize: (dropLineIds) =>
    set((s) => {
      if (!s.subscription) return s
      let sub = s.subscription
      for (const id of dropLineIds) sub = removeLineMutation(sub, id).sub
      return { subscription: persist(sub) }
    }),
  cancelWithReason: (reason) =>
    set((s) => (s.subscription ? { subscription: persist(cancelSubscription(s.subscription, reason)) } : s)),

  addLine: (product, catalogue) =>
    set((s) => (s.subscription ? { subscription: persist(addLineMutation(s.subscription, product, catalogue)) } : s)),
  removeLine: (lineId) =>
    set((s) => (s.subscription ? { subscription: persist(removeLineMutation(s.subscription, lineId).sub) } : s)),
  setLineCadence: (lineId, months) =>
    set((s) => (s.subscription ? { subscription: persist(setLineCadenceMutation(s.subscription, lineId, months)) } : s)),
  setLineQuantity: (lineId, quantity) =>
    set((s) => (s.subscription ? { subscription: persist(setLineQuantityMutation(s.subscription, lineId, quantity)) } : s)),
  setLineUsage: (lineId, product, usageLevel) =>
    set((s) => (s.subscription ? { subscription: persist(setLineUsageMutation(s.subscription, lineId, product, usageLevel)) } : s)),
  setLineSubstitution: (lineId, allow) =>
    set((s) => (s.subscription ? { subscription: persist(setLineSubstitutionMutation(s.subscription, lineId, allow)) } : s)),
  setLineChangePolicy: (lineId, policy) =>
    set((s) => (s.subscription ? { subscription: persist(setLineChangePolicyMutation(s.subscription, lineId, policy)) } : s)),
  setDefaultChangePolicy: (policy) =>
    set((s) => (s.subscription ? { subscription: persist(setDefaultChangePolicyMutation(s.subscription, policy)) } : s)),
  skipNext: (lineId) =>
    set((s) => (s.subscription ? { subscription: persist(skipNextMutation(s.subscription, lineId)) } : s)),
  setNextDispatchDate: (date) =>
    set((s) => (s.subscription ? { subscription: persist(setNextDispatchDateMutation(s.subscription, date)) } : s)),
  sendNow: () => set((s) => (s.subscription ? { subscription: persist(sendNowMutation(s.subscription)) } : s)),
  bringForward: (days) =>
    set((s) => (s.subscription ? { subscription: persist(bringForwardMutation(s.subscription, days)) } : s)),
  delayDispatch: (days) =>
    set((s) => (s.subscription ? { subscription: persist(delayDispatchMutation(s.subscription, days)) } : s)),

  skipDelivery: (deliveryId) =>
    set((s) => (s.subscription ? { subscription: persist(skipDeliveryMutation(s.subscription, deliveryId)) } : s)),
  unskipDelivery: (deliveryId) =>
    set((s) => (s.subscription ? { subscription: persist(unskipDeliveryMutation(s.subscription, deliveryId)) } : s)),
  rescheduleDelivery: (deliveryId, date) =>
    set((s) => (s.subscription ? { subscription: persist(rescheduleDeliveryMutation(s.subscription, deliveryId, date)) } : s)),
  addItemToDelivery: (deliveryId, product) =>
    set((s) => (s.subscription ? { subscription: persist(addItemToDeliveryMutation(s.subscription, deliveryId, product)) } : s)),
  removeItemFromDelivery: (deliveryId, item) =>
    set((s) => (s.subscription ? { subscription: persist(removeItemFromDeliveryMutation(s.subscription, deliveryId, item)) } : s)),

  submitDimension: (dimension, rating) =>
    set((s) => ({
      feedback: [
        ...s.feedback,
        persistCheckIn({
          id: `fb-${Date.now()}`,
          date: new Date().toISOString(),
          ratings: { [dimension]: rating },
          noticedImprovements: rating >= 4,
        }),
      ],
    })),
}))
