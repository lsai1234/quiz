/**
 * Discount codes — generating them, and deciding whether one may be used.
 *
 * Pure. No I/O, so the rules that decide whether money comes off an order are
 * testable without a database.
 */
import type { CodeTerms, PartnerCode, PartnerStatus } from './types'

/** Characters a code may contain, after normalising. */
const ALLOWED = /[^A-Z0-9-]/g

/**
 * Codes are compared in one canonical form.
 *
 * Someone typing `sarah20 ` at checkout and someone reading `SARAH20` off a
 * story are entering the same code, and a partner whose commission depends on
 * the difference would be right to be annoyed.
 */
export function normaliseCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '').replace(ALLOWED, '')
}

/**
 * A code suggestion from a partner's name and their discount, e.g.
 * `Sarah Jones` at 20% → `SARAH20`. Collisions get a numeric suffix.
 */
export function suggestCode(name: string, discountPct: number, taken: Iterable<string> = []): string {
  const firstWord = name.trim().split(/\s+/)[0] ?? 'PARTNER'
  const base = normaliseCode(firstWord).slice(0, 12) || 'PARTNER'
  const pct = Math.round(discountPct * 100)
  const stem = `${base}${pct > 0 ? pct : ''}`

  const used = new Set([...taken].map(normaliseCode))
  if (!used.has(stem)) return stem
  for (let n = 2; n < 100; n++) {
    const candidate = `${stem}-${n}`
    if (!used.has(candidate)) return candidate
  }
  return `${stem}-${Date.now().toString(36).toUpperCase()}`
}

/** Terms a new code starts on. First-order-only by default — see `CodeTerms`. */
export function defaultCodeTerms(): CodeTerms {
  return { firstOrderOnly: true, maxUses: null, uses: 0, startsAt: null, endsAt: null, minSpend: null }
}

export type CodeCheck =
  | { ok: true; discountPct: number }
  | { ok: false; reason: string }

export interface RedemptionContext {
  /** Order subtotal before discount (£). */
  subtotal: number
  /** Whether this is the customer's first order. */
  isFirstOrder: boolean
  /** Status of the partner who owns the code. */
  partnerStatus: PartnerStatus
  now?: Date
}

/**
 * Whether this code may be redeemed right now, and for how much.
 *
 * Every refusal names what is wrong. A code that silently does nothing is the
 * worst outcome here: the customer thinks they got a discount, the partner
 * thinks they earned a commission, and neither is true.
 */
export function checkCode(code: PartnerCode, context: RedemptionContext): CodeCheck {
  const now = context.now ?? new Date()

  if (context.partnerStatus === 'suspended') {
    return { ok: false, reason: 'That code is no longer active.' }
  }
  if (code.status === 'paused') return { ok: false, reason: 'That code is paused.' }
  if (code.status === 'expired') return { ok: false, reason: 'That code has expired.' }

  const { terms } = code
  if (terms.startsAt && now < new Date(terms.startsAt)) {
    return { ok: false, reason: 'That code is not active yet.' }
  }
  if (terms.endsAt && now > new Date(terms.endsAt)) {
    return { ok: false, reason: 'That code has expired.' }
  }
  if (terms.maxUses !== null && terms.uses >= terms.maxUses) {
    return { ok: false, reason: 'That code has been fully redeemed.' }
  }
  if (terms.firstOrderOnly && !context.isFirstOrder) {
    return { ok: false, reason: 'That code is for a first order only.' }
  }
  if (terms.minSpend !== null && context.subtotal < terms.minSpend) {
    return { ok: false, reason: `That code needs an order of £${terms.minSpend.toFixed(2)} or more.` }
  }

  return { ok: true, discountPct: code.discountPct }
}

/** Whether a code has passed its end date, for a status sweep. */
export function isExpired(code: PartnerCode, now = new Date()): boolean {
  if (code.terms.endsAt && now > new Date(code.terms.endsAt)) return true
  return code.terms.maxUses !== null && code.terms.uses >= code.terms.maxUses
}
