import { NextResponse } from 'next/server'
import { getHubUser } from '@/lib/auth/session'
import { getSubscription, saveSubscription } from '@/lib/db/hub-data'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/hub/substitution
 * Body: { substitutions: Record<productId, boolean> }
 * Sets each matching line's out-of-stock substitution consent on the member's
 * stored subscription. Used by the post-checkout confirmation and anywhere the
 * member sets preferences by product rather than by line id.
 */
export async function PATCH(req: Request) {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  let body: { substitutions?: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const map = body.substitutions
  if (!map || typeof map !== 'object') {
    return NextResponse.json({ error: 'substitutions must be a { productId: boolean } map' }, { status: 400 })
  }

  const sub = await getSubscription(user.id)
  if (!sub) return NextResponse.json({ error: 'No subscription found' }, { status: 404 })

  sub.lines = sub.lines.map((l) =>
    l.productId in map ? { ...l, allowSubstitution: Boolean(map[l.productId]) } : l,
  )
  await saveSubscription(user.id, sub)
  return NextResponse.json({ ok: true })
}
