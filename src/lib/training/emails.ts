/**
 * The training plan's two emails (Phase 1, coaching tools), server-only:
 *
 *   training-day    the morning of a day with a session still to do: the
 *                   session, the time they train, one button into it
 *   training-recap  once, after their first week: what got done, a lift that
 *                   went up (or their heaviest), the trainer's check, what's next
 *
 * Both are off until the member turns them on (`plan.reminders`), and every
 * one carries a link that stops both without signing in. Through the outbox:
 * deduped (one a day, one recap per plan) and held to the test allowlist until
 * we go live. Only while the coaching tools are on, and only while their hub
 * is open. Never throws.
 */
import { randomBytes } from 'node:crypto'
import { kvDelete, kvGet, kvSet } from '@/lib/db/kv'
import { appBaseUrl } from '@/lib/notify'
import { emailShell } from '@/lib/notify/brand'
import type { RenderedEmail } from '@/lib/notify/types'
import { spokenClock } from '@/lib/routine/ring'
import { TRAINING_EMAIL_COPY as C } from './email-copy'
import { rollWeek } from './edit'
import { weekdayOf } from './generate'
import { exerciseById } from './library'
import { REMINDERS_OFF, recapDueToday, remindersOf } from './reminders'
import type { LogEntry, Session, TrainingPlan } from './types'
import { dayName, longDay, nextSession, sessionLength, sessionTitle } from './view'

/* ── The stop link ────────────────────────────────────────────────────────── */

const STOP = (token: string) => `training-stop:${token}`
const STOP_OF = (userId: string) => `training-stop-of:${userId}`

/** Their stop link's token: random, kept with their account. */
export async function stopTokenFor(userId: string): Promise<string> {
  const had = await kvGet<string>(STOP_OF(userId))
  if (had) return had
  const token = randomBytes(18).toString('base64url')
  await kvSet(STOP(token), userId)
  await kvSet(STOP_OF(userId), token)
  return token
}

/** Stop by link: both emails off. True when the token was real. */
export async function stopByToken(token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return false
  const userId = await kvGet<string>(STOP(token))
  if (!userId) return false
  const { getTraining, saveTraining } = await import('./store')
  const record = await getTraining(userId)
  if (record.plan) await saveTraining({ ...record, plan: { ...record.plan, reminders: REMINDERS_OFF } })
  return true
}

/** Erasure: the stop link goes with the account. */
export async function deleteStopToken(userId: string): Promise<boolean> {
  const token = await kvGet<string>(STOP_OF(userId))
  if (!token) return false
  await kvDelete(STOP(token))
  await kvDelete(STOP_OF(userId))
  return true
}

/* ── What they say ────────────────────────────────────────────────────────── */

const kg = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} kg`
/** "24 kg × 8", or "12 reps" for bodyweight. */
export function liftLine(e: Pick<LogEntry, 'weightKg' | 'reps'>): string {
  if (e.weightKg != null && e.reps != null) return `${kg(e.weightKg)} × ${e.reps}`
  if (e.weightKg != null) return kg(e.weightKg)
  return `${e.reps ?? 0} reps`
}

type Links = { open: string; stop: string; base: string }

function shell(input: { subject: string; preheader: string; heading: string; intro: string; paragraphs: string[]; cta: string; links: Links }): RenderedEmail {
  return {
    subject: input.subject,
    ...emailShell({
      preheader: input.preheader,
      heading: input.heading,
      intro: input.intro,
      paragraphs: input.paragraphs,
      cta: { label: input.cta, url: input.links.open },
      secondaryCta: { label: C.stop, url: input.links.stop },
      links: { base: input.links.base, optOutUrl: null },
      marketing: null,
    }),
  }
}

/** Today's sessions still to do, strength first. */
export function todaysSessions(plan: TrainingPlan, now: Date): Session[] {
  const today = weekdayOf(now)
  return rollWeek(plan, now)
    .sessions.filter((s) => s.day === today && !s.done)
    .sort((a, b) => (a.type === b.type ? 0 : a.type === 'strength' ? -1 : 1))
}

export function trainingDayEmail(sessions: Session[], trainAt: number | null, firstName: string | null, links: Links): RenderedEmail {
  const [first, ...rest] = sessions
  const title = sessionTitle(first)
  const minutes = sessionLength(first)
  return shell({
    subject: C.daySubject(title),
    preheader: C.dayPreheader(title, minutes),
    heading: C.dayHeading(title),
    intro: C.dayIntro(firstName),
    paragraphs: [
      trainAt != null ? C.dayAt(title, spokenClock(trainAt), minutes) : C.dayNoTime(title, minutes),
      ...rest.map((s) => C.dayAlso(sessionTitle(s), sessionLength(s))),
      ...(first.type === 'strength' ? [C.dayLighter] : []),
    ],
    cta: first.type === 'strength' ? C.dayCtaStart : C.dayCtaOpen,
    links,
  })
}

export interface RecapFacts {
  since: string
  done: number
  wentUp: { exercise: string; from: string; to: string } | null
  heaviest: { exercise: string; line: string } | null
  check: 'checked' | 'waiting' | null
  next: { title: string; day: string; time: string | null } | null
}

/**
 * The recap's facts, from the plan as it stands: sessions done since it was
 * built (this week and any rolled into history), and from the log, one lift
 * that went up, else the heaviest.
 */
export function recapFacts(plan: TrainingPlan, now: Date): RecapFacts {
  const rolled = rollWeek(plan, now)
  const since = plan.createdAt.slice(0, 10)
  const done = rolled.sessions.filter((s) => s.done).length + rolled.history.filter((h) => h.weekOf >= mondayBefore(since)).reduce((n, h) => n + h.done, 0)
  let wentUp: RecapFacts['wentUp'] = null
  let heaviest: { exercise: string; entry: LogEntry } | null = null
  for (const [id, entries] of Object.entries(plan.log ?? {})) {
    const name = exerciseById(id)?.name
    if (!name) continue
    const mine = entries.filter((e) => e.on >= since).sort((a, b) => a.on.localeCompare(b.on))
    if (!mine.length) continue
    const firstE = mine[0]
    const lastE = mine[mine.length - 1]
    if (!wentUp && mine.length > 1 && score(lastE) > score(firstE)) wentUp = { exercise: name, from: liftLine(firstE), to: liftLine(lastE) }
    const top = mine.reduce((a, b) => (score(b) > score(a) ? b : a))
    if (top.weightKg != null && (!heaviest || (heaviest.entry.weightKg ?? 0) < top.weightKg)) heaviest = { exercise: name, entry: top }
  }
  const nextS = nextSession(rolled, weekdayOf(now))
  return {
    since: longDay(plan.createdAt),
    done,
    wentUp,
    heaviest: heaviest ? { exercise: heaviest.exercise, line: liftLine(heaviest.entry) } : null,
    check: plan.check?.state ?? null,
    next: nextS ? { title: sessionTitle(nextS), day: dayName(nextS.day), time: plan.prefs.trainAt != null ? spokenClock(plan.prefs.trainAt) : null } : null,
  }
}

/** Weight first, then reps: what "went up" means for one exercise. */
function score(e: Pick<LogEntry, 'weightKg' | 'reps'>): number {
  return (e.weightKg ?? 0) * 1000 + (e.reps ?? 0)
}

function mondayBefore(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

export function recapEmail(facts: RecapFacts, trainer: string | null, firstName: string | null, links: Links): RenderedEmail {
  const lines = [
    facts.done > 0 ? C.recapDone(facts.done) : C.recapNoneDone,
    ...(facts.wentUp ? [C.recapWentUp(facts.wentUp.exercise, facts.wentUp.from, facts.wentUp.to)] : facts.heaviest ? [C.recapHeaviest(facts.heaviest.exercise, facts.heaviest.line)] : []),
    ...(trainer && facts.check === 'checked' ? [C.recapChecked(trainer)] : trainer && facts.check === 'waiting' ? [C.recapChecking(trainer)] : []),
    ...(trainer ? [C.recapAsk(trainer)] : []),
    ...(facts.next ? [facts.next.time ? C.recapNextAt(facts.next.title, facts.next.day, facts.next.time) : C.recapNext(facts.next.title, facts.next.day)] : []),
  ]
  return shell({
    subject: C.recapSubject,
    preheader: C.recapPreheader,
    heading: C.recapHeading,
    intro: C.recapIntro(firstName, facts.since),
    paragraphs: lines,
    cta: C.recapCta,
    links,
  })
}

/* ── The daily job's step ─────────────────────────────────────────────────── */

export async function sweepTrainingEmails(now = new Date()): Promise<{ days: number; recaps: number }> {
  const result = { days: 0, recaps: 0 }
  try {
    const { getOfferSettings } = await import('@/lib/offer/store')
    const { coachingOn, trainerLive } = await import('@/lib/offer/settings')
    const settings = await getOfferSettings()
    if (!coachingOn(settings, 'coaching')) return result
    const trainer = trainerLive(settings) ? settings.trainer.name.trim() : null
    const [{ realPlans }, { getUserById }, { trainingAccess }, { queueNotification, deliverIfAutomatic, getByDedupeKey }] = await Promise.all([
      import('./store'),
      import('@/lib/db/users'),
      import('./access'),
      import('@/lib/notify/outbox'),
    ])
    const base = appBaseUrl()
    const today = now.toISOString().slice(0, 10)
    for (const plan of await realPlans()) {
      try {
        const want = remindersOf(plan)
        if (!want.days && !want.recap) continue
        const user = await getUserById(plan.userId)
        if (!user?.email) continue
        if (!(await trainingAccess(user, now)).allowed) continue
        const firstName = user.name?.trim().split(/\s+/)[0] ?? null
        const stop = `${base}/myhub/training/emails?stop=${await stopTokenFor(plan.userId)}`

        if (want.days) {
          const sessions = todaysSessions(plan, now)
          const dedupeKey = `training-day:${plan.userId}:${today}`
          if (sessions.length && !(await getByDedupeKey(dedupeKey))) {
            const first = sessions[0]
            const open = first.type === 'strength' ? `${base}/myhub/training?workout=${encodeURIComponent(first.id)}` : `${base}/myhub/training`
            const queued = await queueNotification({
              userId: plan.userId,
              email: user.email,
              template: 'training-day',
              dedupeKey,
              rendered: trainingDayEmail(sessions, plan.prefs.trainAt, firstName, { open, stop, base }),
            })
            await deliverIfAutomatic(queued)
            result.days++
          }
        }

        const recapKey = `training-recap:${plan.userId}:${plan.createdAt}`
        if (want.recap && recapDueToday(plan, now) && !(await getByDedupeKey(recapKey))) {
          const queued = await queueNotification({
            userId: plan.userId,
            email: user.email,
            template: 'training-recap',
            dedupeKey: recapKey,
            rendered: recapEmail(recapFacts(plan, now), trainer, firstName, { open: `${base}/myhub/training`, stop, base }),
          })
          await deliverIfAutomatic(queued)
          result.recaps++
        }
      } catch (err) {
        console.error('[training] one member’s training emails failed:', err)
      }
    }
  } catch (err) {
    console.error('[training] training email sweep failed:', err)
  }
  return result
}
