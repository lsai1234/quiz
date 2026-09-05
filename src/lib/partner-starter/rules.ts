/**
 * Partner starter stacks — deciding whether one may be spent, and on what.
 *
 * Pure, and deliberately free of `node:crypto` for the same reason
 * `founder-codes/codes.ts` is: the basket prices a £0.00 order in the browser
 * from the same functions `/api/cart` bills from, and it cannot reach them
 * through a module that pulls in a Node built-in. Minting lives in
 * `generate.ts`, server-side.
 */
import { TIER_META } from '@/lib/quiz-core'
import {
  founderDeliveryOptions,
  priceAtFounderTerms,
  type FounderPricingLine,
} from '@/lib/founder-codes/codes'
import type { getPricingConfig } from '@/lib/stack-blueprint/pricing'
import type { PartnerStarter, StarterState, StarterTier } from './types'

/**
 * How long a starter lives.
 *
 * Three weeks rather than the founder codes' 24 hours, because this one has a
 * journey in front of it: an invite email that may sit unread for a weekend, an
 * agreement to read, a quiz to take and a stack to choose. A code that dies
 * before the partner has finished deciding is a code that generates an email
 * asking for another one.
 *
 * The liability that 24 hours exists to bound is bounded differently here: a
 * starter is worth one capped stack to one named partner, and it does nothing
 * at all until they have signed for it.
 */
export const STARTER_TTL_DAYS = 21

/**
 * The most the goods may list at, per tier (£ inc VAT).
 *
 * A GUARD, not a price. The partner picks their own stack out of the quiz, and
 * without a ceiling "your stack, free" is an open basket — one £180 order from
 * a misunderstanding costs more than the campaign earns from that partner.
 *
 * Set against what the depths actually list at as a one-off box rather than
 * against `TIER_PRICE_BANDS`, which bands the MONTHLY SUBSCRIPTION total: a
 * one-off box holds whole tubs, several of which last more than a month, so a
 * £55/month Balanced stack is a ~£126 box. These sit above that with enough
 * headroom for an expensive pick and well below what a Complete stack lists at,
 * which is the line the programme does not offer.
 */
export const STARTER_GOODS_CAP: Record<StarterTier, number> = {
  essentials: 90,
  performance: 140,
}

/** The two depths a starter can be issued at, cheapest first. */
export const STARTER_TIERS: StarterTier[] = ['essentials', 'performance']

/** "Essentials" / "Balanced" — the words the programme uses, from one place. */
export function starterTierLabel(tier: StarterTier): string {
  return TIER_META[tier].label
}

/** One canonical form, so `ps-7k4m2xqp ` and `PS-7K4M2XQP` are one code. */
export function normaliseStarterCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '')
}

/** Whether a string is shaped like one of ours — a cheap pre-filter, not a check. */
export function looksLikeStarterCode(input: string): boolean {
  return /^PS-[0-9A-Z]{8}$/.test(normaliseStarterCode(input))
}

/** When a starter issued now should die. */
export function starterExpiry(from: Date = new Date()): string {
  return new Date(from.getTime() + STARTER_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * Which of the five states a starter is in.
 *
 * `unsigned` sits between "issued" and "ready" and is the whole point of the
 * object: a starter that has not been signed for is not a live code that
 * happens to be missing a form, it is an offer nobody has accepted yet.
 */
export function starterState(starter: PartnerStarter, now: Date = new Date()): StarterState {
  if (starter.revokedAt) return 'revoked'
  if (starter.usedAt) return 'used'
  if (now >= new Date(starter.expiresAt)) return 'expired'
  if (!starter.agreementId) return 'unsigned'
  return 'ready'
}

/** Milliseconds left, floored at zero. */
export function starterRemainingMs(starter: PartnerStarter, now: Date = new Date()): number {
  return Math.max(0, new Date(starter.expiresAt).getTime() - now.getTime())
}

export type StarterCheck = { ok: true; starter: PartnerStarter } | { ok: false; reason: string }

/**
 * Whether this starter may be redeemed right now.
 *
 * Every refusal names what is wrong. The unsigned one names the fix as well,
 * because it is the only refusal here that the person reading it can act on
 * without emailing us — and a partner staring at a £0.00 basket that just asked
 * them for £126 has no other way to work out which of five things went wrong.
 */
export function checkStarter(starter: PartnerStarter, now: Date = new Date()): StarterCheck {
  switch (starterState(starter, now)) {
    case 'revoked':
      return { ok: false, reason: 'That code has been cancelled.' }
    case 'used':
      return { ok: false, reason: 'That code has already been used.' }
    case 'expired':
      return { ok: false, reason: 'That code has expired. Ask us for another one.' }
    case 'unsigned':
      return {
        ok: false,
        reason: 'Sign your partner agreement at /partner first — that is what turns this code on.',
      }
  }
  if (starter.claimToken) return { ok: false, reason: 'That code is being used right now.' }
  return { ok: true, starter }
}

/**
 * What a starter buys.
 *
 * ONE-OFF STACKS ONLY, and this is a guard rather than a note.
 *
 *   • A starter on a SUBSCRIPTION would not make one box free — it would make
 *     every renewal free, for as long as the plan ran, long after the code
 *     itself had expired. The same reasoning as `founderCodeWorksOn`, and the
 *     same conclusion.
 *   • A starter on the SHOP SHELF is not the thing being given. The offer is
 *     "the stack the quiz built you", which is what the partner is going to
 *     talk about; an open shop basket at 100% off is a different and much
 *     larger promise.
 */
export type StarterChannel = 'shop' | 'quiz' | 'subscription'

export function starterWorksOn(channel: StarterChannel | null | undefined): boolean {
  // An unstated channel is NOT eligible, the stricter default: this takes 100%
  // off, and a caller that forgot to say what it was selling should go quiet
  // and be fixed, not quietly hand out a free box.
  return channel === 'quiz'
}

export type FitCheck = { ok: true } | { ok: false; reason: string }

/**
 * Whether this basket is within what the starter was issued for.
 *
 * Checked on the LIST subtotal — what the goods would have cost anybody else —
 * rather than on what is being charged, which is zero by construction and
 * therefore inside every ceiling ever set.
 */
export function starterFits(
  starter: PartnerStarter,
  goodsListSubtotal: number,
  format: (n: number) => string,
): FitCheck {
  if (goodsListSubtotal <= starter.goodsCap) return { ok: true }
  return {
    ok: false,
    reason:
      `Your ${starterTierLabel(starter.tier)} starter covers up to ${format(starter.goodsCap)} of products, ` +
      `and this stack comes to ${format(goodsListSubtotal)}. Drop something, or buy the difference on a normal order.`,
  }
}

// ─── What a starter does to the money ────────────────────────────────────────

type Config = ReturnType<typeof getPricingConfig>

/**
 * Price a starter order: every line at £0.00.
 *
 * Delegates to the founder domain's `free` terms rather than repeating them.
 * The two instruments are genuinely different objects — that is why they have
 * separate tables, separate lifecycles and separate modules — but "everything
 * at zero, under the margin floor rather than clamped by it" is arithmetic, and
 * two copies of arithmetic that have to agree are one copy that eventually will
 * not. The bug that would hide in the second copy is the expensive one: a
 * screen showing £0.00 while a card is charged the floor price.
 */
export function priceStarterOrder(lines: FounderPricingLine[], config?: Config) {
  return priceAtFounderTerms('free', lines, config)
}

/** Delivery on a starter order: nothing. Same reasoning, same source. */
export function starterDeliveryOptions(orderValue: number, config?: Config) {
  return founderDeliveryOptions('free', { supplierValue: 0, orderValue }, config)
}
