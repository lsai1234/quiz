import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getLiveOfferSettings, saveServiceSettings } from '@/lib/offer/store'
import { ACTIVITIES, EXERCISES } from '@/lib/training/library'
import { countPlans } from '@/lib/training/store'
import { getTutorials, setTutorial } from '@/lib/training/tutorials'
import { getTrainerTips, setTrainerTip } from '@/lib/training/trainer-tips'
import { exerciseVideos, setExerciseVideo } from '@/lib/media/exercise-videos'
import { getLiveQa, saveLiveQa } from '@/lib/training/live-qa'

/**
 * Settings → Training plan (founders only).
 *
 *   GET   whether it's on and which coaching phases are, how many members
 *         have a plan, and every exercise and activity with its link, the
 *         trainer's tip and its uploaded video
 *   POST  { id, url }          one tutorial link; null or "" clears it
 *         { id, tip }          the trainer's tip; null or "" clears it
 *         { id, videoId }      an uploaded video on it; null takes it off
 *         { services }         the coaching phase switches
 *         { liveQa }           the monthly live Q&A (or null to clear it)
 *
 * The training plan's own switch is a box service (Settings → Offer).
 */
export const dynamic = 'force-dynamic'

async function payload() {
  const [settings, tutorials, plans, tips, videos] = await Promise.all([getLiveOfferSettings(), getTutorials(), countPlans(), getTrainerTips(), exerciseVideos()])
  const row = (id: string, name: string, group: string) => ({ id, name, group, url: tutorials[id] ?? null, tip: tips[id] ?? null, video: videos[id] ?? null })
  return {
    enabled: settings.services.training,
    phases: { coaching: settings.services.coaching, video: settings.services.video, programmes: settings.services.programmes },
    liveQa: await getLiveQa(),
    plans,
    items: [...EXERCISES.map((e) => row(e.id, e.name, e.pattern)), ...Object.values(ACTIVITIES).map((a) => row(a.id, a.name, 'activity'))],
  }
}

export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await payload())
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { id?: unknown; url?: unknown; tip?: unknown; videoId?: unknown; services?: unknown; liveQa?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  try {
    if (body.services && typeof body.services === 'object') {
      const s = body.services as Record<string, unknown>
      const patch: Record<string, boolean> = {}
      for (const k of ['coaching', 'video', 'programmes'] as const) if (typeof s[k] === 'boolean') patch[k] = s[k] as boolean
      await saveServiceSettings(patch)
      return NextResponse.json(await payload())
    }
    if ('liveQa' in body) {
      await saveLiveQa(body.liveQa && typeof body.liveQa === 'object' ? (body.liveQa as Record<string, unknown>) : null)
      return NextResponse.json(await payload())
    }
    if (typeof body.id !== 'string') return NextResponse.json({ error: 'Which exercise?' }, { status: 400 })
    if ('tip' in body) await setTrainerTip(body.id, typeof body.tip === 'string' ? body.tip : null)
    else if ('videoId' in body) await setExerciseVideo(body.id, typeof body.videoId === 'string' ? body.videoId : null)
    else await setTutorial(body.id, typeof body.url === 'string' ? body.url : null)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not save' }, { status: 400 })
  }
  return NextResponse.json(await payload())
}
