import { NextResponse } from 'next/server'
import { getFounder, isPortalAuthed } from '@/lib/portal/guard'
import { logMemberAccess } from '@/lib/portal/access-log'
import { getLiveOfferSettings } from '@/lib/offer/store'
import { getUserById } from '@/lib/db/users'
import { ACTIVITIES, exerciseById } from '@/lib/training/library'
import { markPlanChecked, plansToCheck } from '@/lib/training/store'
import { sessionTitle, setupLine } from '@/lib/training/view'
import { TRAINER_COPY } from '@/lib/trainer/copy'
import { sendPlanNoteEmail } from '@/lib/trainer/emails'
import { firstNameOf } from '@/lib/trainer/server'
import { noteFromTrainer, TrainerError } from '@/lib/trainer/store'

/**
 * Founders Hub → Trainer → Plans to check.
 *
 *   GET   every plan waiting for the trainer's check, longest wait first:
 *         who, their setup, and the week, exercise by exercise
 *   POST  { userId, note? }  checked; a note goes to their chat and emails them.
 *         Checking a member's plan is logged as an access to their record.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const plans = await plansToCheck(5000, new URL(req?.url ?? 'http://local/').searchParams.get('samples') === '1' ? 'samples' : 'real')
  const rows = await Promise.all(
    plans.map(async (p) => {
      const user = await getUserById(p.userId)
      return {
        userId: p.userId,
        email: user?.email ?? null,
        firstName: firstNameOf(user?.name),
        since: p.check!.since,
        source: p.source,
        setup: setupLine(p.prefs),
        sessions: p.sessions.map((s) => ({
          day: s.day,
          title: sessionTitle(s),
          moves: s.type === 'strength' ? s.exercises.map((e) => exerciseById(e.id)?.name ?? e.id) : [`${ACTIVITIES[s.activity]?.name ?? s.activity}, ${s.minutes} min`],
        })),
      }
    }),
  )
  return NextResponse.json({ plans: rows })
}

export async function POST(req: Request) {
  const founder = await getFounder()
  if (!founder || !(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { userId?: unknown; note?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (typeof body.userId !== 'string') return NextResponse.json({ error: 'userId' }, { status: 400 })
  const by = founder.name || founder.email
  const plan = await markPlanChecked(body.userId, by)
  if (!plan) return NextResponse.json({ error: 'Not waiting' }, { status: 404 })
  await logMemberAccess({ founderEmail: founder.email, userId: body.userId, kind: 'member-trainer', path: '/founderhub/trainer#plans' })
  if (typeof body.note === 'string' && body.note.trim()) {
    const user = await getUserById(body.userId)
    if (user) {
      try {
        const { thread, message } = await noteFromTrainer({ userId: user.id, email: user.email, firstName: firstNameOf(user.name) }, { text: body.note, about: TRAINER_COPY.planNoteAbout, by })
        await sendPlanNoteEmail(thread, message, (await getLiveOfferSettings()).trainer)
      } catch (err) {
        if (!(err instanceof TrainerError)) throw err
      }
    }
  }
  return NextResponse.json({ ok: true, check: plan.check })
}
