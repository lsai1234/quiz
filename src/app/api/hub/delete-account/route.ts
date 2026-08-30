import { NextResponse } from 'next/server'
import { endHubSession, getHubUser } from '@/lib/auth/session'
import { deleteAccount } from '@/lib/db/erasure'
import { getSubscription } from '@/lib/db/hub-data'
import { reportError } from '@/lib/monitoring/report'

export const dynamic = 'force-dynamic'

/**
 * POST /api/hub/delete-account — erase the signed-in member's account.
 *
 * Article 17. Self-service, immediate, and irreversible, which is why it asks
 * for the word rather than a single tap: `confirm: 'DELETE'` in the body. A
 * one-tap destructive action next to "pause my plan" is a support queue waiting
 * to happen, and there is no undo to offer.
 *
 * An active subscription is refused rather than silently cancelled. Erasing the
 * plan out from under a live Stripe subscription would leave it billing against
 * an account that no longer exists — the member has to cancel first, which also
 * puts the settlement figure in front of them before anything is destroyed.
 *
 * Scoped to the session's own user id, never a parameter.
 */
export async function POST(req: Request) {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  if (body?.confirm !== 'DELETE') {
    return NextResponse.json(
      { error: 'Type DELETE to confirm. This cannot be undone.' },
      { status: 400 },
    )
  }

  const subscription = await getSubscription(user.id)
  if (subscription?.status === 'active') {
    return NextResponse.json(
      {
        error:
          'Cancel your subscription first — that way you see anything left to settle before your account goes. You can delete straight afterwards.',
        code: 'active-subscription',
      },
      { status: 409 },
    )
  }

  try {
    const result = await deleteAccount(user.id)
    // Sign them out last: the session row is already gone, and clearing the
    // cookie stops the browser presenting a token for an account that no
    // longer answers to it.
    await endHubSession()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    // A half-finished erasure is the one failure a member must never be told
    // succeeded, so this reports loudly rather than swallowing.
    await reportError(err, {
      surface: 'hub',
      severity: 'critical',
      path: '/api/hub/delete-account',
      context: { userId: user.id },
    })
    return NextResponse.json(
      { error: 'We could not complete that. Nothing has been half-deleted — please try again or email us.' },
      { status: 500 },
    )
  }
}
