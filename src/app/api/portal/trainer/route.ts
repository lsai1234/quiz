import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getOfferSettings, saveServiceSettings, saveTrainerProfile } from '@/lib/offer/store'
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

async function payload() {
  const [settings, inbox, plans] = await Promise.all([getOfferSettings(), listInbox(), plansToCheck()])
  return {
    /** Plans waiting for the trainer's check, for the tab's count. */
    plansWaiting: plans.length,
    on: settings.services.trainer,
    live: trainerLive(settings),
    trainer: settings.trainer,
    inbox,
    waiting: inbox.filter((r) => r.waiting).length,
  }
}

export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await payload())
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
