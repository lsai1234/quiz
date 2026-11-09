/**
 * What we measure about the training plan and the trainer, for Founders Hub →
 * Member hub (server-only). Counted from what's already stored: plans, their
 * logs and weeks, orders, and the trainer's threads. Real members only; the
 * samples (Test views) never count. Nothing new is tracked about anyone.
 */
import { rollWeek } from './edit'
import { mondayOf } from './generate'
import type { TrainingPlan } from './types'

const DAY = 86_400_000

/** A count out of a total, so the page can say "7 of 12" and a percent. */
export interface Share {
  of: number
  n: number
}

export interface TrainingMeasures {
  /** One-off buyers whose first order is 5+ weeks old: how many ordered again, with a plan or without. */
  reorder: { training: Share; rest: Share }
  /** Plans a week old or more: a session ticked or a set logged in their first 7 days. */
  firstSession: Share
  /** Plans with a session done this week. */
  thisWeek: Share
  /** Sessions done a week, per plan, over the last 4 full weeks. Null with nothing to count. */
  sessionsPerWeek: number | null
  /** Plans whose 4th (and 12th) week has ended: a session done in it. */
  week4: Share
  week12: Share
  /** Questions answered in 30 days: inside the stated reply time, and rated helpful. */
  answers: { answered: number; withinPromise: number; promiseHours: number; rated: number; helpful: number }
  /** Plan checks done in 30 days: inside 24 hours. And any waiting longer now. */
  checks: Share & { waitingOver24h: number }
}

interface OrderLike {
  email: string | null
  userId: string | null
  createdAt: string
  channel: string
  status: string
}

const COUNTED = (o: OrderLike) => !['pending_payment', 'cancelled', 'failed', 'refunded'].includes(o.status)

/** The Monday `weeks` weeks after the plan's first Monday. */
function weekStart(plan: Pick<TrainingPlan, 'createdAt'>, weeks: number): string {
  return mondayOf(new Date(Date.parse(plan.createdAt) + weeks * 7 * DAY))
}

function doneIn(plan: TrainingPlan, monday: string): number | null {
  if (plan.weekOf === monday) return plan.sessions.filter((s) => s.done).length
  return plan.history.find((h) => h.weekOf === monday)?.done ?? null
}

export function measuresFrom(input: {
  plans: TrainingPlan[]
  /** The email on each plan's account. */
  emails: Map<string, string>
  orders: OrderLike[]
  answers: TrainingMeasures['answers']
  now: Date
}): TrainingMeasures {
  const { now } = input
  const thisMonday = mondayOf(now)
  const plans = input.plans.map((p) => rollWeek(p, now))

  // Reorders: one-off orders only (a monthly plan's renewals aren't a choice made again).
  const firstBy = new Map<string, { at: number; again: boolean }>()
  for (const o of [...input.orders].filter((x) => COUNTED(x) && x.email && x.channel !== 'subscription').sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const key = o.email!.toLowerCase()
    const had = firstBy.get(key)
    if (!had) firstBy.set(key, { at: Date.parse(o.createdAt), again: false })
    else had.again = true
  }
  const trainers = new Set([...input.emails.values()].map((e) => e.toLowerCase()))
  const reorder = { training: { of: 0, n: 0 }, rest: { of: 0, n: 0 } }
  for (const [email, f] of firstBy) {
    if (now.getTime() - f.at < 35 * DAY) continue
    const side = trainers.has(email) ? reorder.training : reorder.rest
    side.of++
    if (f.again) side.n++
  }

  // First session inside 7 days.
  const firstSession = { of: 0, n: 0 }
  for (const p of plans) {
    const built = Date.parse(p.createdAt)
    if (now.getTime() - built < 7 * DAY) continue
    firstSession.of++
    const by = new Date(built + 7 * DAY).toISOString().slice(0, 10)
    const logged = Object.values(p.log ?? {}).some((es) => es.some((e) => e.on >= p.createdAt.slice(0, 10) && e.on <= by))
    if (logged || (doneIn(p, weekStart(p, 0)) ?? 0) > 0) firstSession.n++
  }

  // This week, and sessions a week over the last 4 full weeks.
  const thisWeek = { of: plans.length, n: plans.filter((p) => p.sessions.some((s) => s.done)).length }
  let weeks = 0
  let sessions = 0
  for (const p of plans) {
    for (let back = 1; back <= 4; back++) {
      const monday = mondayOf(new Date(Date.parse(`${thisMonday}T12:00:00Z`) - back * 7 * DAY))
      const done = doneIn(p, monday)
      if (done === null) continue
      weeks++
      sessions += done
    }
  }

  // Still training in week 4 and week 12, once that week has ended (and while it's in the record).
  const weekN = (n: number): Share => {
    const out = { of: 0, n: 0 }
    for (const p of plans) {
      const monday = weekStart(p, n - 1)
      if (monday >= thisMonday) continue
      const done = doneIn(p, monday)
      if (done === null) continue
      out.of++
      if (done > 0) out.n++
    }
    return out
  }

  // Plan checks.
  const since30 = now.getTime() - 30 * DAY
  const checks = { of: 0, n: 0, waitingOver24h: 0 }
  for (const p of input.plans) {
    const c = p.check
    if (!c) continue
    if (c.state === 'waiting' && now.getTime() - Date.parse(c.since) > DAY) checks.waitingOver24h++
    if (c.state === 'checked' && c.at && Date.parse(c.at) >= since30) {
      checks.of++
      if (Date.parse(c.at) - Date.parse(c.since) <= DAY) checks.n++
    }
  }

  return {
    reorder,
    firstSession,
    thisWeek,
    sessionsPerWeek: weeks ? Math.round((sessions / weeks) * 10) / 10 : null,
    week4: weekN(4),
    week12: weekN(12),
    answers: input.answers,
    checks,
  }
}

export async function trainingMeasures(now = new Date()): Promise<TrainingMeasures> {
  const [{ realPlans }, { getUserById }, { listOrders }, { replyStats }, { getLiveOfferSettings }] = await Promise.all([
    import('./store'),
    import('@/lib/db/users'),
    import('@/lib/orders/repo'),
    import('@/lib/trainer/store'),
    import('@/lib/offer/store'),
  ])
  const plans = await realPlans()
  const emails = new Map<string, string>()
  for (const p of plans) {
    const u = await getUserById(p.userId).catch(() => null)
    if (u?.email) emails.set(p.userId, u.email)
  }
  const promiseHours = (await getLiveOfferSettings()).trainer.replyHours
  const stats = await replyStats(promiseHours, now)
  return measuresFrom({
    plans,
    emails,
    orders: await listOrders({ limit: 500 }),
    answers: { answered: stats.answered, withinPromise: stats.withinPromise, promiseHours, rated: stats.rated, helpful: stats.helpful },
    now,
  })
}
