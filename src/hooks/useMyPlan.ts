'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * The signed-in member's plan, as the shop needs it (`GET /api/hub/next-box`):
 * whether there is one, what's on it, when the next box goes, and, given a
 * product, what adding it to that box would cost or why it can't go in.
 *
 * Signed out, or no plan, it's null and the shop offers what it always did,
 * a monthly basket among it. Someone already on a plan is offered their next
 * box instead, because an account holds one plan.
 */
export interface MyPlan {
  status: 'active' | 'paused' | 'cancelled'
  day: number
  nextBox: { id: string; date: string } | null
  productIds: string[]
}

export interface MyPlanState {
  /** Still asking. */
  loading: boolean
  plan: MyPlan | null
  quote: { box: { id: string; date: string }; price: number } | null
  refusal: { reason: string; error: string } | null
}

const NONE: MyPlanState = { loading: false, plan: null, quote: null, refusal: null }

export function useMyPlan(productId?: string | null, variantId?: string | null): MyPlanState & { reload: () => void } {
  const [state, setState] = useState<MyPlanState>({ ...NONE, loading: true })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let live = true
    const q = productId ? `?productId=${encodeURIComponent(productId)}${variantId ? `&variantId=${encodeURIComponent(variantId)}` : ''}` : ''
    fetch(`/api/hub/next-box${q}`)
      .then(async (res) => {
        if (!live) return
        if (!res.ok) return setState(NONE)
        const data = (await res.json()) as Omit<MyPlanState, 'loading'>
        setState({ loading: false, plan: data.plan ?? null, quote: data.quote ?? null, refusal: data.refusal ?? null })
      })
      .catch(() => live && setState(NONE))
    return () => {
      live = false
    }
  }, [productId, variantId, tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { ...state, reload }
}

/** Add one of a product to the next box. Resolves to what to tell the member. */
export async function addToNextBox(productId: string, variantId: string | null): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch('/api/hub/next-box', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, variantId }),
    })
    const data = (await res.json().catch(() => ({}))) as { said?: string; error?: string }
    return res.ok ? { ok: true, message: data.said ?? 'Added to your next box.' } : { ok: false, message: data.error ?? 'That didn’t go in your box. Please try again.' }
  } catch {
    return { ok: false, message: 'We couldn’t reach your account. Check your connection and try again.' }
  }
}
