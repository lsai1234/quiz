import { NextResponse } from 'next/server'
import { getHubUser } from '@/lib/auth/session'
import { dealsFor } from '@/lib/deals/server'

/**
 * GET /api/hub/deals → { enabled, deals, hubEndsOn }
 *
 * The signed-in member's deals (`lib/deals`): what each costs, when it opens
 * and when it ends. Prices only, never our costs or margins. Buying goes
 * through the checkout's one-product path, which prices the deal again.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  return NextResponse.json(await dealsFor(user))
}
