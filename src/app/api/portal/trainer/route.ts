import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getLiveOfferSettings, saveServiceSettings, saveTrainerProfile } from '@/lib/offer/store'
import { trainerLive } from '@/lib/offer/settings'
import { PersistError } from '@/lib/portal/persist'
import { listInbox } from '@/lib/trainer/store'
import { plansToCheck } from '@/lib/training/store'

/**
 * Founders Hub → Trainer.
 *
 *   GET   the inbox (waiting first, longest wait at the top), the trainer's
 *         profile and whether it's live
 *   POST  { on?: boolean, trainer?: Partial<TrainerProfile> }
 */
export const dynamic = 'force-dynamic'

async function payload(which: 'real' | 'samples' = 'real') {
  const [settings, inbox, plans] = await Promise.all([getLiveOfferSettings(), listInbox(500, which), plansToCheck(5000, which)])
  const [{ replyStats }, { getDraft }] = await Promise.all([import('@/lib/trainer/store'), import('@/lib/trainer/drafts')])
  // Which waiting members have an AI draft ready.
  const drafted = (await Promise.all(inbox.filter((r) => r.waiting).map(async (r) => ((await getDraft(r.userId)) ? r.userId : null)))).filter((id): id is string => Boolean(id))
  return {
    /** Reply time and ratings over the last 30 days, real members only. */
    stats: await replyStats(settings.trainer.replyHours),
    /** Showing the sample members from Settings → Test views instead of real ones. */
    samples: which === 'samples',
    /** Plans waiting for the trainer's check, for the tab's count. */
    plansWaiting: plans.length,
    on: settings.services.trainer,
    live: trainerLive(settings),
    trainer: settings.trainer,
    inbox: inbox.map((r) => ({ ...r, drafted: drafted.includes(r.userId) })),
    waiting: inbox.filter((r) => r.waiting).length,
  }
}

export async function GET(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // `?samples=1`: the sample members from Settings → Test views, in place of real ones.
  return NextResponse.json(await payload(new URL(req?.url ?? 'http://local/').searchParams.get('samples') === '1' ? 'samples' : 'real'))
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { on?: unknown; trainer?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  try {
    if (body.trainer && typeof body.trainer === 'object') await saveTrainerProfile(body.trainer as Record<string, unknown>)
    if (typeof body.on === 'boolean') await saveServiceSettings({ trainer: body.on })
  } catch (err) {
    if (err instanceof PersistError) return NextResponse.json({ error: err.message }, { status: 503 })
    throw err
  }
  return NextResponse.json(await payload())
}
