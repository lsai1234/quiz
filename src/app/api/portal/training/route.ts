import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getOfferSettings } from '@/lib/offer/store'
import { ACTIVITIES, EXERCISES } from '@/lib/training/library'
import { countPlans } from '@/lib/training/store'
import { getTutorials, setTutorial } from '@/lib/training/tutorials'

/**
 * Settings → Training plan (founders only).
 *
 *   GET   whether it's on, how many members have a plan, and every exercise
 *         and activity with its tutorial link
 *   POST  { id, url } sets one tutorial link; url null or "" clears it
 *
 * The switch itself is a box service (Settings → Offer → Box services).
 */
export const dynamic = 'force-dynamic'

async function payload() {
  const [settings, tutorials, plans] = await Promise.all([getOfferSettings(), getTutorials(), countPlans()])
  return {
    enabled: settings.services.training,
    plans,
    items: [
      ...EXERCISES.map((e) => ({ id: e.id, name: e.name, group: e.pattern, url: tutorials[e.id] ?? null })),
      ...Object.values(ACTIVITIES).map((a) => ({ id: a.id, name: a.name, group: 'activity', url: tutorials[a.id] ?? null })),
    ],
  }
}

export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await payload())
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { id?: unknown; url?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (typeof body.id !== 'string') return NextResponse.json({ error: 'Which exercise?' }, { status: 400 })
  try {
    await setTutorial(body.id, typeof body.url === 'string' ? body.url : null)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not save' }, { status: 400 })
  }
  return NextResponse.json(await payload())
}
