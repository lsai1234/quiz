import { NextResponse } from 'next/server'
import { getHubUser } from '@/lib/auth/session'
import { appBaseUrl } from '@/lib/notify'
import { coachingOn } from '@/lib/offer/settings'
import { getOfferSettings } from '@/lib/offer/store'
import { trainingAccess } from '@/lib/training/access'
import { getLiveQa, liveQaIcs } from '@/lib/training/live-qa'

/**
 * GET /api/hub/live-qa/calendar → the live Q&A as a calendar invite (.ics),
 * for a signed-in member with an open hub while Programmes and goals is on.
 * It points back to the hub, where the join link shows the day before.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Sign in' }, { status: 401 })
  if (!coachingOn(await getOfferSettings(), 'programmes') || !(await trainingAccess(user)).allowed) return NextResponse.json({ error: 'Not available' }, { status: 404 })
  const qa = await getLiveQa()
  if (!qa || Date.parse(qa.startsAt) + qa.minutes * 60_000 < Date.now()) return NextResponse.json({ error: 'Nothing coming up' }, { status: 404 })
  return new NextResponse(liveQaIcs(qa, `${appBaseUrl()}/myhub/training`), {
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'attachment; filename="live-qa.ics"', 'cache-control': 'private, no-store' },
  })
}
