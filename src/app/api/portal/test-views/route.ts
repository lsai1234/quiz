import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getFounder, isPortalAuthed } from '@/lib/portal/guard'
import { getLiveOfferSettings } from '@/lib/offer/store'
import { hubOnSale, trainerLive } from '@/lib/offer/settings'
import { TEST_VIEW_COOKIE } from '@/lib/samples/domain'
import { DEFAULT_TEST_SWITCHES, getTestView, normaliseSwitches, openTestView } from '@/lib/samples/session'
import { setTestViewCookies } from '@/lib/samples/cookies'

/**
 * Founders Hub → Settings → Test views.
 *
 *   GET     the switches test views use, whether one is open, and what's live
 *   POST    { switches } → opens (or updates) this browser's test view
 *   DELETE  clears every sample member's data, ready to build again
 */
export const dynamic = 'force-dynamic'

async function state() {
  const jar = await cookies()
  const view = await getTestView(jar.get(TEST_VIEW_COOKIE)?.value)
  const live = await getLiveOfferSettings()
  return {
    open: Boolean(view),
    switches: view?.switches ?? DEFAULT_TEST_SWITCHES,
    live: {
      training: live.services.training,
      trainer: trainerLive(live),
      deals: live.services.deals,
      checkIns: live.services.checkIns,
      hubOnSale: hubOnSale(live),
      coaching: live.services.coaching,
      video: live.services.video,
      programmes: live.services.programmes,
    },
  }
}

export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await state())
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { switches?: unknown } | null
  const jar = await cookies()
  const founder = await getFounder().catch(() => null)
  const view = await openTestView(founder?.email ?? 'founder', normaliseSwitches(body?.switches), jar.get(TEST_VIEW_COOKIE)?.value)
  await setTestViewCookies(view)
  return NextResponse.json({ ...(await state()), open: true, switches: view.switches })
}

export async function DELETE() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { resetSampleMembers } = await import('@/lib/samples/members')
  return NextResponse.json({ ok: true, cleared: await resetSampleMembers() })
}
