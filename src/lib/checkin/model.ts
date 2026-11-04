/**
 * Amp's check-ins (Option 2, a box that learns): one record per order or plan,
 * anchored on its stack guide's token, which is the only key to it.
 *
 *   Schedule     every 14 days from the guide's first check-in date: six for a
 *                one-off box (twelve weeks), a year's worth for a plan while it
 *                is active. Stopped for good by one link in every email.
 *   Answers      per product, how they're using it; their training; whether
 *                the times fit; how happy they are with the box (1–5). Nothing
 *                about their health (see `./copy`).
 *   Suggestions  from their latest answers: leave out what they've stopped, a
 *                nudge for what they haven't started, training products while
 *                they're not training, and a person to talk to if they're not
 *                happy. A suggestion is only ever a change they can choose.
 *
 * Pure.
 */
import { CHECKIN_COPY } from './copy'

export type Using = 'daily' | 'some' | 'notYet' | 'stopped'
export type Training = 'same' | 'more' | 'less' | 'stopped'

export const USING: readonly Using[] = ['daily', 'some', 'notYet', 'stopped']
export const TRAINING: readonly Training[] = ['same', 'more', 'less', 'stopped']

export interface CheckInAnswer {
  at: string
  using: Record<string, Using>
  training: Training | null
  timesWork: boolean | null
  /** 1–5. */
  happy: number | null
}

export interface CheckInRecord {
  v: 1
  /** The stack guide's token: the only key to the guide and to these check-ins. */
  token: string
  plan: 'oneoff' | 'subscription'
  userId: string | null
  orderId: string | null
  /** Where the check-in emails go. Removed with the record. */
  email: string
  firstName: string | null
  createdAt: string
  /** YYYY-MM-DD. */
  nextDue: string
  sent: number
  answers: CheckInAnswer[]
  stopped: boolean
  lastActivity: string
}

export const EVERY_DAYS = 14
export const MAX_SENDS = { oneoff: 6, subscription: 26 } as const

export function addDays(date: string, days: number): string {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function isDue(record: CheckInRecord, today: string): boolean {
  return !record.stopped && record.sent < MAX_SENDS[record.plan] && record.nextDue <= today
}

/** Keep an answer from the browser to the shape, and to the products in the box. */
export function normaliseAnswer(raw: unknown, productIds: readonly string[], at: string): CheckInAnswer {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const using: Record<string, Using> = {}
  const rawUsing = (r.using && typeof r.using === 'object' ? r.using : {}) as Record<string, unknown>
  for (const id of productIds) {
    const v = rawUsing[id]
    if (typeof v === 'string' && (USING as readonly string[]).includes(v)) using[id] = v as Using
  }
  const happy = typeof r.happy === 'number' && Number.isInteger(r.happy) && r.happy >= 1 && r.happy <= 5 ? r.happy : null
  return {
    at,
    using,
    training: typeof r.training === 'string' && (TRAINING as readonly string[]).includes(r.training) ? (r.training as Training) : null,
    timesWork: typeof r.timesWork === 'boolean' ? r.timesWork : null,
    happy,
  }
}

export type SuggestionKind = 'drop' | 'notStarted' | 'training' | 'times' | 'unhappy'

export interface Suggestion {
  kind: SuggestionKind
  productId: string | null
  text: string
  /** A one-off box: reorder without these. A plan: change it in the account. */
  action: { kind: 'reorder-without'; productIds: string[] } | { kind: 'account' } | { kind: 'guide' } | null
}

/**
 * What they could change, from their latest answers. `products` are the
 * guide's, with whether each is for training days.
 */
export function suggestionsFor(
  record: Pick<CheckInRecord, 'plan' | 'answers'>,
  products: readonly { id: string; short: string; trainingDays: boolean }[],
): Suggestion[] {
  const latest = record.answers[record.answers.length - 1]
  if (!latest) return []
  const s = CHECKIN_COPY.suggest
  const out: Suggestion[] = []
  const change = (ids: string[]): Suggestion['action'] =>
    record.plan === 'oneoff' ? { kind: 'reorder-without', productIds: ids } : { kind: 'account' }

  for (const p of products) {
    const using = latest.using[p.id]
    if (using === 'stopped') {
      out.push({ kind: 'drop', productId: p.id, text: record.plan === 'oneoff' ? s.dropOneOff(p.short) : s.dropPlan(p.short), action: change([p.id]) })
    } else if (using === 'notYet') {
      out.push({ kind: 'notStarted', productId: p.id, text: s.notStarted(p.short), action: { kind: 'guide' } })
    } else if (latest.training === 'stopped' && p.trainingDays) {
      out.push({ kind: 'training', productId: p.id, text: s.training(p.short), action: change([p.id]) })
    }
  }
  if (latest.timesWork === false) out.push({ kind: 'times', productId: null, text: s.times, action: null })
  if (latest.happy !== null && latest.happy <= 2) out.push({ kind: 'unhappy', productId: null, text: s.unhappy, action: null })
  return out
}
