import { NextResponse } from 'next/server'
import { getHubUser } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

/**
 * PUT /api/hub/guide-day  { wake, bed, trainAt, trainWeekdays } → { ok, day }
 *
 * "Set your day": the member's guide rebuilt around the day they give
 * (`guide/day`), so "today" in the hub and the guide's page say their times
 * rather than assumed ones. Their guide is their plan's, or else their latest
 * order's, the same one the hub shows.
 */
export async function PUT(req: Request) {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const [{ getSubscription }, { listPaidOrdersFor }, { getGuide, saveGuide }, { getResolvedCatalogue }, { guideWithDay }] = await Promise.all([
    import('@/lib/db/hub-data'),
    import('@/lib/orders/repo'),
    import('@/lib/guide/store'),
    import('@/lib/catalogue/resolve'),
    import('@/lib/guide/day'),
  ])
  const sub = await getSubscription(user.id)
  const orders = sub?.guideToken ? [] : await listPaidOrdersFor({ userId: user.id, email: user.email }, '1970-01-01T00:00:00.000Z', 20)
  const token = sub?.guideToken ?? orders.find((o) => o.guideToken)?.guideToken ?? null
  const guide = token ? await getGuide(token) : null
  if (!guide) return NextResponse.json({ error: 'There’s no guide on this account to change yet.' }, { status: 409 })

  const { products } = await getResolvedCatalogue()
  const next = guideWithDay(guide, body, products)
  await saveGuide(next)
  return NextResponse.json({ ok: true, day: next.routine.day })
}
