import { NextResponse } from 'next/server'
import { getHubUser } from '@/lib/auth/session'
import { hubHome } from '@/lib/hub/home'

/**
 * GET /api/hub/home → HubHome
 *
 * Everything the member hub's home screen shows, for the signed-in member, in
 * one request: their access, today's products, guide, check-ins, tips, the
 * training plan's next session, member prices and orders.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  return NextResponse.json(await hubHome(user))
}
