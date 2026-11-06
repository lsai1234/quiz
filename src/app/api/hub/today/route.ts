import { NextResponse } from 'next/server'
import { getHubUser } from '@/lib/auth/session'
import { hubAccess, isOpen } from '@/lib/hub/access'
import { setTick } from '@/lib/hub/home'

/**
 * POST /api/hub/today { productId, done } → { done: string[] }
 *
 * Tick a product off today's list (or untick it). Kept for the day only:
 * tomorrow starts clean.
 */
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (!isOpen(await hubAccess(user))) return NextResponse.json({ error: 'Not open' }, { status: 403 })
  let body: { productId?: unknown; done?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (typeof body.productId !== 'string' || body.productId.length > 80 || typeof body.done !== 'boolean') {
    return NextResponse.json({ error: 'Which product?' }, { status: 400 })
  }
  const today = new Date().toISOString().slice(0, 10)
  return NextResponse.json({ done: await setTick(user.id, today, body.productId, body.done) })
}
