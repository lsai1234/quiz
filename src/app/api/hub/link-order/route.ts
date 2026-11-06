import { NextResponse } from 'next/server'
import { getHubUser } from '@/lib/auth/session'
import { rateLimiter } from '@/lib/consult/ai/guard'
import { finishLink, startLink } from '@/lib/hub/link-order'

/**
 * POST /api/hub/link-order
 *   { email }        → { sent: true } always (a code goes only where there are orders to join)
 *   { code }         → { linked } or 400 with { reason }
 *
 * Joins orders placed under another email to the signed-in account.
 */
export const dynamic = 'force-dynamic'

const busy = rateLimiter(60, 60_000)

export async function POST(req: Request) {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (busy()) return NextResponse.json({ error: 'Busy, try again in a minute' }, { status: 429 })
  let body: { email?: unknown; code?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (typeof body.code === 'string') {
    const r = await finishLink(user, body.code)
    return r.ok ? NextResponse.json({ linked: r.linked }) : NextResponse.json({ error: 'Code not accepted', reason: r.reason }, { status: 400 })
  }
  if (typeof body.email === 'string' && body.email.length < 200) {
    await startLink(user, body.email)
    // The same answer either way, so this can't tell anyone who has ordered.
    return NextResponse.json({ sent: true })
  }
  return NextResponse.json({ error: 'An email or a code, please' }, { status: 400 })
}
