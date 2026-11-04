/**
 * What the check-in page shows: the box's products (from its guide), their
 * answers so far, and what they could change. No email address, ever.
 */
import type { StackGuide } from '@/lib/guide/build'
import { longDate } from '@/lib/guide/build'
import { suggestionsFor, type CheckInAnswer, type CheckInRecord, type Suggestion } from './model'

export interface CheckInView {
  token: string
  plan: CheckInRecord['plan']
  firstName: string | null
  products: { id: string; short: string; trainingDays: boolean }[]
  answers: CheckInAnswer[]
  suggestions: Suggestion[]
  nextDue: string | null
  stopped: boolean
}

export function checkInView(record: CheckInRecord, guide: StackGuide): CheckInView {
  const training = new Set(guide.routine.items.filter((i) => i.days === 'training-days').map((i) => i.productId))
  const products = guide.products.map((p) => ({ id: p.id, short: p.short, trainingDays: training.has(p.id) }))
  return {
    token: record.token,
    plan: record.plan,
    firstName: record.firstName,
    products,
    answers: record.answers,
    suggestions: suggestionsFor(record, products),
    nextDue: record.stopped ? null : longDate(record.nextDue),
    stopped: record.stopped,
  }
}
