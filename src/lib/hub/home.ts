/**
 * The member hub's home screen, built in one go (server-only): their access,
 * today's products from their guide (ticked off as they go), the guide itself,
 * check-ins, this week's tips, the training plan's next session, their member
 * prices and their orders. Each part is only what's switched on and theirs.
 */
import type { UserRecord } from '@/lib/db/users'
import { kvGet, kvSet } from '@/lib/db/kv'
import type { StackGuide } from '@/lib/guide/build'
import { spokenClock } from '@/lib/routine/ring'
import type { PourAnchor, SwapGroup } from '@/lib/catalogue/types'
import { pickTips } from '@/lib/tips/pick'
import { hubAccess, isOpen } from './access'
import type { HubHome, TodayItem } from './home-types'

type Who = Pick<UserRecord, 'id' | 'email' | 'name'>

const ymd = (d: Date) => d.toISOString().slice(0, 10)
/** Monday of the week, for the weekly tips. */
function weekKey(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7))
  return ymd(x)
}

/* ── Today's ticks ──────────────────────────────────────────────────────── */

interface Ticks {
  date: string
  done: string[]
}
const ticksKey = (userId: string) => `hub-today:${userId}`

export async function getTicks(userId: string, today: string): Promise<string[]> {
  const t = await kvGet<Ticks>(ticksKey(userId))
  return t && t.date === today ? t.done : []
}

export async function setTick(userId: string, today: string, productId: string, done: boolean): Promise<string[]> {
  const current = await getTicks(userId, today)
  const next = done ? [...new Set([...current, productId])] : current.filter((id) => id !== productId)
  await kvSet<Ticks>(ticksKey(userId), { date: today, done: next })
  return next
}

/** Today's products from the guide: timed ones in order, then the rest; training-day ones only on training days. */
export function todayFrom(guide: StackGuide, now: Date, done: readonly string[]): TodayItem[] {
  const weekday = (now.getUTCDay() + 6) % 7
  const training = guide.routine.day.trainWeekdays
  const items: TodayItem[] = []
  for (const moment of guide.routine.moments) {
    for (const i of moment.items) {
      if (i.days === 'training-days' && training?.length && !training.includes(weekday)) continue
      items.push({
        productId: i.productId,
        title: i.title,
        time: i.minutes === null ? null : spokenClock(i.minutes),
        minutes: i.minutes,
        moment: i.moment,
        amount: i.amount,
        done: done.includes(i.productId),
      })
    }
  }
  return items
}

/* ── Seen tips ──────────────────────────────────────────────────────────── */

interface SeenTips {
  week: string
  ids: string[]
  seen: string[]
}

/* ── The whole home ─────────────────────────────────────────────────────── */

export async function hubHome(user: Who, now = new Date()): Promise<HubHome> {
  const [{ getOfferSettings }, { getSubscription }, { listPaidOrdersFor }] = await Promise.all([
    import('@/lib/offer/store'),
    import('@/lib/db/hub-data'),
    import('@/lib/orders/repo'),
  ])
  const [settings, access, sub] = await Promise.all([getOfferSettings(), hubAccess(user, now), getSubscription(user.id)])
  const open = isOpen(access)
  const services = { training: settings.services.training, deals: settings.services.deals, checkIns: settings.services.checkIns }
  const orders = await listPaidOrdersFor({ userId: user.id, email: user.email }, '1970-01-01T00:00:00.000Z', 20)

  // Their guide: the plan's, or their latest order's.
  const { getGuide } = await import('@/lib/guide/store')
  const token = sub?.guideToken ?? orders.find((o) => o.guideToken)?.guideToken ?? null
  const guide = token ? await getGuide(token) : null

  const kindOf = new Map<string, string>()
  if (guide) {
    const { getResolvedCatalogue } = await import('@/lib/catalogue/resolve')
    for (const p of (await getResolvedCatalogue()).products) kindOf.set(p.id, p.swapGroup)
  }
  const today = ymd(now)
  const done = guide && open ? await getTicks(user.id, today) : []
  const firstName = guide?.firstName ?? (user.name ? user.name.trim().split(/\s+/)[0] : null)

  // Check-ins on that guide.
  let checkIn: HubHome['checkIn'] = null
  if (guide && services.checkIns) {
    const { getCheckIns } = await import('@/lib/checkin/store')
    const r = await getCheckIns(guide.token)
    if (r) checkIn = { token: r.token, nextDue: r.stopped ? null : r.nextDue, due: !r.stopped && r.nextDue <= today, answered: r.answers.length, stopped: r.stopped }
  }

  // This week's tips, fitted to their box, their day and whether they train.
  let tips: HubHome['tips'] = []
  if (guide && open) {
    const { getResolvedCatalogue } = await import('@/lib/catalogue/resolve')
    const { products } = await getResolvedCatalogue()
    const kinds = guide.products.map((p) => products.find((x) => x.id === p.id)?.swapGroup).filter((k): k is SwapGroup => Boolean(k))
    const moments = guide.routine.items.map((i) => i.anchor as PourAnchor)
    const trains = Boolean(guide.routine.day.trainDays || guide.routine.day.trainWeekdays?.length)
    const key = `hub-tips:${user.id}`
    const week = weekKey(now)
    const had = await kvGet<SeenTips>(key)
    if (had && had.week === week) {
      const { TIPS } = await import('@/lib/tips/library')
      tips = had.ids.map((id) => TIPS.find((t) => t.id === id)).filter((t): t is NonNullable<typeof t> => Boolean(t))
    } else {
      const picked = pickTips({ kinds, moments, trains }, week, had?.seen ?? [], user.id)
      tips = picked.tips
      await kvSet<SeenTips>(key, { week, ids: picked.tips.map((t) => t.id), seen: picked.seen })
    }
  }

  // The training plan's next session.
  let training: HubHome['training'] = null
  if (services.training && open) {
    const { getTraining } = await import('@/lib/training/store')
    const { rollWeek, weekdayOf } = await Promise.all([import('@/lib/training/edit'), import('@/lib/training/generate')]).then(([e, g]) => ({ rollWeek: e.rollWeek, weekdayOf: g.weekdayOf }))
    const { nextSession, progressOf, sessionSummary, sessionTitle } = await import('@/lib/training/view')
    const rec = await getTraining(user.id)
    const plan = rec.plan ? rollWeek(rec.plan, now) : null
    const next = plan ? nextSession(plan, weekdayOf(now)) : null
    const p = plan ? progressOf(plan) : { done: 0, planned: 0 }
    training = {
      hasPlan: Boolean(plan),
      next: next ? { title: sessionTitle(next), day: next.day, summary: sessionSummary(next) } : null,
      done: p.done,
      planned: p.planned,
      week: plan ? plan.sessions.map((x) => ({ day: x.day, done: x.done })) : [],
    }
  }

  // Member prices, in short.
  let deals: HubHome['deals'] = null
  if (services.deals && open) {
    const { dealsFor } = await import('@/lib/deals/server')
    const { DEALS_COPY } = await import('@/lib/deals/copy')
    const d = await dealsFor(user, now)
    const openDeals = d.deals.filter((x) => x.state === 'open')
    const upcoming = d.deals.filter((x) => x.state === 'upcoming')
    deals = {
      open: openDeals.length,
      upcoming: upcoming.length,
      next: upcoming[0] ? { short: upcoming[0].short, line: DEALS_COPY.dealLine(upcoming[0].quote), opensInDays: upcoming[0].opensInDays } : null,
      best: openDeals[0] ? { short: openDeals[0].short, line: DEALS_COPY.dealLine(openDeals[0].quote), total: openDeals[0].quote.total } : null,
    }
  }

  // Ask your trainer, in short.
  let trainer: HubHome['trainer'] = null
  const { trainerLive } = await import('@/lib/offer/settings')
  if (trainerLive(settings) && open) {
    const { getThread, unreadForMember } = await import('@/lib/trainer/store')
    const thread = await getThread(user.id)
    const last = thread?.messages[thread.messages.length - 1] ?? null
    trainer = {
      name: settings.trainer.name,
      role: settings.trainer.role,
      photoUrl: settings.trainer.photoUrl,
      replyHours: settings.trainer.replyHours,
      unread: unreadForMember(thread),
      waiting: Boolean(thread?.waiting),
      last: last ? { from: last.from, text: last.text.slice(0, 160), at: last.at } : null,
    }
  }

  // Seen this week, for the founders' numbers.
  await kvSet(`hub-seen:${user.id}`, { at: now.toISOString() })

  return {
    access,
    firstName,
    services,
    today: guide && open ? { date: today, items: todayFrom(guide, now, done) } : null,
    guide: guide
      ? {
          token: guide.token,
          stackName: guide.stackName,
          products: guide.products.map((p) => ({
            id: p.id,
            kind: kindOf.get(p.id) ?? null,
            short: p.short,
            title: p.title,
            type: p.type,
            imageUrl: p.imageUrl,
            time: p.time,
            moment: p.moment,
            daysLabel: p.daysLabel,
            amount: p.amount,
            serving: p.serving,
            claims: p.claims.map((c) => ({ text: c.wording, condition: c.condition ?? null })),
            warnings: p.warnings,
          })),
        }
      : null,
    checkIn,
    tips,
    training,
    trainer,
    deals,
    orders: orders.slice(0, 10).map((o) => ({
      reference: o.reference ?? o.id.slice(0, 8).toUpperCase(),
      createdAt: o.createdAt,
      total: o.total,
      items: o.lines.filter((l) => !l.bonus).map((l) => l.title),
      status: o.status,
    })),
  }
}
