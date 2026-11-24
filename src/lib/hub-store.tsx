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
 * Saving the plan.
 *
 * Every change shows at once (they are all instant and reversible on screen),
 * then is saved through `/api/hub/subscription`, which also tells Stripe.
 *
 * Saves go one at a time, in the order they were made, and each is made afresh
 * on top of the plan as last stored, sent with that plan's version. Two things
 * used to go wrong without that:
 *
 *  - Two quick changes raced. Each sent the whole plan, and whichever arrived
 *    last was saved, even if it was the older of the two.
 *  - A plan changed somewhere else (another tab, another device, a renewal) was
 *    quietly undone by the next change made here, because this sent a whole plan
 *    built from what the screen had loaded earlier.
 *
 * Now the server answers a stale version with the current plan (409, `stale`),
 * and the change is made again on top of that and sent once more, so the member's
 * change and the other one both stand. A save that fails for any other reason
 * (Stripe refused, a price the server won't accept) is dropped, the screen goes
 * back to what is stored, and the member is told. What is shown is never a
 * change that didn't happen.
 */
type Change = (sub: MemberSubscription) => MemberSubscription

/** The plan as last stored, and its version. What every save is made on top of. */
let stored: { subscription: MemberSubscription; version: string | null } | null = null
let queue: Promise<void> = Promise.resolve()
let waiting = 0

function setStored(subscription: MemberSubscription | null, version: string | null) {
  stored = subscription ? { subscription, version } : null
}

/** Make a change on screen now, and queue its save. */
function change(fn: Change): void {
  const current = useHubStore.getState().subscription
  if (!current) return
  useHubStore.setState({ subscription: fn(current) })
  waiting += 1
  queue = queue
    .then(() => save(fn))
    .catch(() => {})
    .finally(() => {
      waiting -= 1
      // Once nothing else is on its way, show the plan exactly as stored (the
      // server re-prices what it's sent), or what's left after a refusal.
      if (waiting === 0 && stored) useHubStore.setState({ subscription: stored.subscription })
    })
}

async function save(fn: Change, retried = false): Promise<void> {
  if (!stored) return
  const subscription = fn(stored.subscription)
  let res: Response
  try {
    res = await fetch('/api/hub/subscription', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription, version: stored.version }),
    })
  } catch {
    useHubStore.setState({ saveError: 'We couldn’t reach your account, so that change may not have saved. Check your connection and try again.' })
    // Find out what did happen, if the account can be reached at all now.
    await useHubStore.getState().refresh()
    return
  }
  const data = (await res.json().catch(() => ({}))) as {
    error?: string
    code?: string
    subscription?: MemberSubscription
    version?: string
  }
  if (res.ok) {
    setStored(data.subscription ?? subscription, data.version ?? null)
    return
  }
  if (res.status === 409 && data.code === 'stale' && data.subscription && !retried) {
    setStored(data.subscription, data.version ?? null)
    return save(fn, true)
  }
  useHubStore.setState({ saveError: data.error ?? 'We couldn’t save that change. Please try again.' })
  // Go back to what's actually stored, so the screen stops showing a change that didn't happen.
  await useHubStore.getState().refresh()
}

/**
 * Run a request that changes the plan on the server (an extra for the next box)
 * in the same line as the saves, so it never lands between a save and the
 * version that save was made against. Then reload the plan as stored.
 */
function viaQueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job)
  queue = run.then(
    () => {},
    () => {},
  )
  return run
}

async function boxRequest(init: RequestInit & { url: string }, fallback: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(init.url, init)
    const data = (await res.json().catch(() => ({}))) as { error?: string; said?: string }
    await useHubStore.getState().refresh()
    if (res.ok) return { ok: true, message: data.said ?? '' }
    const message = data.error ?? fallback
    useHubStore.setState({ saveError: message })
    return { ok: false, message }
  } catch {
    const message = 'We couldn’t reach your account. Check your connection and try again.'
    useHubStore.setState({ saveError: message })
    return { ok: false, message }
  }
}

/**
 * Save a check-in. It shows at once; if it doesn't save, it comes off again and
 * the member is told, rather than being lost while it looks kept.
 */
function persistCheckIn(checkIn: FeedbackCheckIn): FeedbackCheckIn {
  const failed = () =>
    useHubStore.setState((s) => ({
      feedback: s.feedback.filter((f) => f.id !== checkIn.id),
      saveError: 'We couldn’t save your check-in. Please try again.',
    }))
  void fetch('/api/hub/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ checkIn }),
  })
    .then((res) => {
      if (!res.ok) failed()
    })
    .catch(failed)
  return checkIn
}

/**
 * What couldn't be loaded, if anything.
 *
 *   session  we couldn't tell whether they're signed in
 *   plan     signed in, but their plan didn't load
 *
 * Neither is "signed out" or "no plan". Treating them as those used to send a
 * subscriber to the sign-in screen, or tell them they had no plan, whenever a
 * request failed.
 */
export type HubLoadProblem = 'session' | 'plan' | null

interface HubStore {
  session: HubSession | null
  subscription: MemberSubscription | null
  feedback: FeedbackCheckIn[]
  /** True once the initial /api/auth/me restore has completed. */
  hydrated: boolean
  /** OAuth providers the server has configured (which buttons to show). */
  providers: { id: string; label: string }[]
  /** Whether a reset link can actually be emailed — no provider, no link shown. */
  canResetPassword: boolean
  /**
   * Set when a write-through failed and the local state has been rolled back to
   * what is actually stored. The hub shows it and clears it — a mutation that
   * silently didn't happen is worse than one that visibly didn't.
   */
  saveError: string | null
  /** What couldn't be loaded, if anything: see `HubLoadProblem`. */
  loadProblem: HubLoadProblem

  /** Restore the signed-in state on load (cookie session → account data). */
  hydrate: () => Promise<void>
  /** Re-read the stored plan: after a failed save, and to retry a failed load. */
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

  /**
   * Add something to the next box (`/api/hub/next-box`): charged with that box's
   * payment and packed in it. Resolves to whether it went in, and what to say.
   */
  addExtra: (productId: string, variantId?: string | null) => Promise<{ ok: boolean; message: string }>
  /** Take an extra back out of its box, and off the payment. */
  removeExtra: (extraId: string) => Promise<{ ok: boolean; message: string }>
}

/** Fetch the account's plan, its version and check-ins. `null` when it couldn't be loaded. */
async function loadAccountData(): Promise<{
  subscription: MemberSubscription | null
  version: string | null
  feedback: FeedbackCheckIn[]
} | null> {
  try {
    const res = await fetch('/api/hub/subscription')
    if (!res.ok) return null
    const data = (await res.json()) as { subscription?: MemberSubscription | null; version?: string | null; feedback?: FeedbackCheckIn[] }
    const subscription = data.subscription ?? null
    const version = data.version ?? null
    setStored(subscription, version)
    return { subscription, version, feedback: data.feedback ?? [] }
  } catch {
    return null
  }
}

/** The store's fields for a load that worked, or didn't. */
function accountState(data: Awaited<ReturnType<typeof loadAccountData>>) {
  return data
    ? { subscription: data.subscription, feedback: data.feedback, loadProblem: null }
    : { subscription: null, feedback: [], loadProblem: 'plan' as const }
}

export const useHubStore = create<HubStore>((set) => ({
  session: null,
  subscription: null,
  feedback: [],
  hydrated: false,
  providers: [],
  canResetPassword: false,
  saveError: null,
  loadProblem: null,

  refresh: async () => {
    const data = await loadAccountData()
    // A refresh that fails leaves what's on screen; one that was retrying a failed load says so again.
    if (data) set(accountState(data))
  },

  clearSaveError: () => set({ saveError: null }),

  hydrate: async () => {
    let me: {
      user?: { email: string | null; name: string } | null
      providers?: { id: string; label: string }[]
      canResetPassword?: boolean
    }
    try {
      const res = await fetch('/api/auth/me')
      if (!res.ok) throw new Error(`auth/me ${res.status}`)
      me = await res.json()
    } catch {
      // Not "signed out": we don't know. The hub says so and offers to try again.
      set({ hydrated: true, loadProblem: 'session' })
      return
    }
    const providers = me.providers ?? []
    const canResetPassword = me.canResetPassword ?? false
    if (!me.user) {
      setStored(null, null)
      set({ hydrated: true, providers, canResetPassword, session: null, loadProblem: null })
      return
    }
    const data = await loadAccountData()
    set({
      session: { email: me.user.email ?? '', name: me.user.name },
      ...accountState(data),
      hydrated: true,
      providers,
      canResetPassword,
    })
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
      const account = await loadAccountData()
      set({ session: { email: data.user.email ?? '', name: data.user.name }, ...accountState(account) })
      return null
    } catch {
      return 'Network error — try again'
    }
  },

  logout: () => {
    void fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    setStored(null, null)
    set({ session: null, subscription: null, feedback: [], loadProblem: null })
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
    change((sub) => setDispatchDay(sub, day)),
  pause: () => change((sub) => pauseSubscription(sub)),
  resume: () => change((sub) => resumeSubscription(sub)),
  cancel: () => change((sub) => cancelSubscription(sub)),
  swapLine: (lineId, newProduct) =>
    change((sub) => swapSubscriptionLine(sub, lineId, newProduct)),

  snooze: (months) =>
    change((sub) => snoozeSubscription(sub, months)),
  applyDownsize: (dropLineIds) =>
    change((sub) => dropLineIds.reduce((next, id) => removeLineMutation(next, id).sub, sub)),
  cancelWithReason: (reason) =>
    change((sub) => cancelSubscription(sub, reason)),

  addLine: (product, catalogue) =>
    change((sub) => addLineMutation(sub, product, catalogue)),
  removeLine: (lineId) =>
    change((sub) => removeLineMutation(sub, lineId).sub),
  setLineCadence: (lineId, months) =>
    change((sub) => setLineCadenceMutation(sub, lineId, months)),
  setLineQuantity: (lineId, quantity) =>
    change((sub) => setLineQuantityMutation(sub, lineId, quantity)),
  setLineUsage: (lineId, product, usageLevel) =>
    change((sub) => setLineUsageMutation(sub, lineId, product, usageLevel)),
  setLineSubstitution: (lineId, allow) =>
    change((sub) => setLineSubstitutionMutation(sub, lineId, allow)),
  setLineChangePolicy: (lineId, policy) =>
    change((sub) => setLineChangePolicyMutation(sub, lineId, policy)),
  setDefaultChangePolicy: (policy) =>
    change((sub) => setDefaultChangePolicyMutation(sub, policy)),
  skipNext: (lineId) =>
    change((sub) => skipNextMutation(sub, lineId)),
  setNextDispatchDate: (date) =>
    change((sub) => setNextDispatchDateMutation(sub, date)),
  sendNow: () => change((sub) => sendNowMutation(sub)),
  bringForward: (days) =>
    change((sub) => bringForwardMutation(sub, days)),
  delayDispatch: (days) =>
    change((sub) => delayDispatchMutation(sub, days)),

  skipDelivery: (deliveryId) =>
    change((sub) => skipDeliveryMutation(sub, deliveryId)),
  unskipDelivery: (deliveryId) =>
    change((sub) => unskipDeliveryMutation(sub, deliveryId)),
  rescheduleDelivery: (deliveryId, date) =>
    change((sub) => rescheduleDeliveryMutation(sub, deliveryId, date)),
  addItemToDelivery: (deliveryId, product) =>
    change((sub) => addItemToDeliveryMutation(sub, deliveryId, product)),
  removeItemFromDelivery: (deliveryId, item) =>
    change((sub) => removeItemFromDeliveryMutation(sub, deliveryId, item)),

  addExtra: (productId, variantId = null) =>
    viaQueue(() =>
      boxRequest(
        { url: '/api/hub/next-box', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, variantId }) },
        'That didn’t go in your box. Please try again.',
      ),
    ),
  removeExtra: (extraId) =>
    viaQueue(() =>
      boxRequest({ url: `/api/hub/next-box?id=${encodeURIComponent(extraId)}`, method: 'DELETE' }, 'That didn’t come out of your box. Please try again.'),
    ),

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
