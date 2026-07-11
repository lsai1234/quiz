import { NextResponse } from 'next/server'
import { getHubUser } from '@/lib/auth/session'
import { getSubscription, saveSubscription, listFeedback, getQuiz } from '@/lib/db/hub-data'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { createMockSubscription } from '@/lib/recharge/mock'
import type { MemberSubscription } from '@/lib/recharge/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/hub/subscription → { subscription, feedback, seeded? }
 * The member's stored subscription + check-in history. First sign-in has no
 * stored subscription yet, so one is seeded from the sample blueprint (the
 * previous demo behaviour, now persisted per account). Live, the seed is
 * replaced by the member's real Recharge contract.
 */
export async function GET() {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  let subscription = await getSubscription(user.id)
  let seeded = false
  if (!subscription) {
    // No stored bundle (a direct hub sign-up that never subscribed) — seed the
    // demo bundle so the hub isn't empty. A member who subscribed via checkout
    // already has their real bundle stored, so this branch is skipped for them.
    const { products } = await getResolvedCatalogue()
    subscription = createMockSubscription(products, user.email ?? '')
    await saveSubscription(user.id, subscription)
    seeded = true
  }

  const [feedback, quiz] = await Promise.all([listFeedback(user.id), getQuiz(user.id)])
  return NextResponse.json({ subscription, feedback, quiz, seeded })
}

/**
 * PUT /api/hub/subscription
 * Body: { subscription: MemberSubscription } → { ok }
 * Persists the latest subscription state after a hub mutation. The mutation
 * helpers are pure client-side functions, so the document is stored verbatim.
 */
export async function PUT(req: Request) {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  let body: { subscription?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const subscription = body.subscription as MemberSubscription | undefined
  if (!subscription || typeof subscription !== 'object' || !Array.isArray(subscription.lines)) {
    return NextResponse.json({ error: 'subscription must be a MemberSubscription' }, { status: 400 })
  }

  await saveSubscription(user.id, subscription)
  return NextResponse.json({ ok: true })
}
