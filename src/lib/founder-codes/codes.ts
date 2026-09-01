/**
 * Founder codes — deciding whether one may be used, and what it does to a price.
 *
 * Pure, and deliberately free of `node:crypto`: the basket has to price a
 * cost-price order in the browser from the same function `/api/cart` bills
 * from, and it cannot do that through a module that pulls in a Node built-in.
 * Minting a code is the one thing here that needs randomness, and it lives on
 * its own in `generate.ts`, server-side.
 */
import { getPricingConfig, priceOneOffLines, type OneOffPricing } from '@/lib/stack-blueprint/pricing'
import { costFromSupplierPrice } from '@/lib/pricing/vat'
import { quoteDelivery, deliveryOptions, type DeliveryOption } from '@/lib/pricing/delivery'
import type { FounderCode, FounderCodeKind, FounderCodeState } from './types'

const round = (n: number) => Math.round(n * 100) / 100

/** How long a code lives. Every kind, no dial. */
export const FOUNDER_CODE_TTL_HOURS = 24

/** One canonical form, so `fh-free-abc ` and `FH-FREE-ABC` are one code. */
export function normaliseFounderCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '')
}

/** Whether a string is shaped like one of ours — a cheap pre-filter, not a check. */
export function looksLikeFounderCode(input: string): boolean {
  return /^FH-(FREE|COST|MIN)-[0-9A-Z]{8}$/.test(normaliseFounderCode(input))
}

/** When a code generated now should die. */
export function founderCodeExpiry(from: Date = new Date()): string {
  return new Date(from.getTime() + FOUNDER_CODE_TTL_HOURS * 60 * 60 * 1000).toISOString()
}

/** Which of the four states a code is in — what a screen has to say about it. */
export function founderCodeState(code: FounderCode, now: Date = new Date()): FounderCodeState {
  if (code.revokedAt) return 'revoked'
  if (code.usedAt) return 'used'
  if (now >= new Date(code.expiresAt)) return 'expired'
  return 'live'
}

/** Milliseconds left on a live code, floored at zero. */
export function founderCodeRemainingMs(code: FounderCode, now: Date = new Date()): number {
  return Math.max(0, new Date(code.expiresAt).getTime() - now.getTime())
}

export type FounderCodeCheck =
  | { ok: true; kind: FounderCodeKind }
  | { ok: false; reason: string }

/**
 * Whether this code may be redeemed right now.
 *
 * Every refusal names what is wrong, the same rule the partner codes follow: a
 * code that silently does nothing is worse than one that says no, because the
 * founder standing at a checkout with a £0.00 basket that just charged them £48
 * has no way to tell which of the two happened.
 *
 * A claimed-but-unused code reads as taken. A checkout that claimed one and
 * then failed releases it (`releaseFounderCode`), so this only refuses a code
 * that is genuinely in flight somewhere else.
 */
export function checkFounderCode(code: FounderCode, now: Date = new Date()): FounderCodeCheck {
  switch (founderCodeState(code, now)) {
    case 'revoked':
      return { ok: false, reason: 'That code has been cancelled.' }
    case 'used':
      return { ok: false, reason: 'That code has already been used.' }
    case 'expired':
      return { ok: false, reason: 'That code has expired.' }
  }
  if (code.claimToken) return { ok: false, reason: 'That code is being used right now.' }
  return { ok: true, kind: code.kind }
}

// ─── What a code does to the money ───────────────────────────────────────────

/** One line, as the catalogue priced it, before any founder code touches it. */
export interface FounderPricingLine {
  /** Shelf price, inc VAT (£). */
  price: number
  /** What PowerBody charge us for it, EX VAT (£) — `unitCostOf`. */
  cost: number
  quantity?: number
}

/**
 * Price an order at a founder code's terms.
 *
 * Returns the same shape `priceOneOffLines` does, so `/api/cart` bills from one
 * object either way and no caller has to know which kind of code it is holding.
 *
 * The bundle tiers and the margin floor are deliberately NOT consulted for
 * `free` and `cost`. These SET a price rather than discounting one, and
 * `discountWithFloor` would clamp it in both directions: a free order cannot
 * reach zero through it at all (the floor is cost × (1 + marginFloorPct), which
 * is what stops a partner's 100% doing the same), and a cost price would be
 * dragged up to the floor wherever the floor happens to sit above it. That is
 * exactly the class of bug where the screen says £0.00 and the card is charged
 * £14.40.
 */
export function priceAtFounderTerms(
  kind: FounderCodeKind,
  lines: FounderPricingLine[],
  config = getPricingConfig(),
): OneOffPricing {
  // An unlock code is not a discount. It buys nothing but the right to check
  // out under the minimum, so the order prices exactly as it would have.
  if (kind === 'unlock') return priceOneOffLines(lines, config)

  const qtyOf = (l: FounderPricingLine) => Math.max(1, Math.round(l.quantity ?? 1))
  const subtotal = round(lines.reduce((s, l) => s + l.price * qtyOf(l), 0))

  const priced = lines.map((l) => {
    const quantity = qtyOf(l)
    // `cost` is PowerBody's ex-VAT quote. While we are not VAT-registered their
    // VAT is money that genuinely leaves the account and is never coming back,
    // so cost price means the gross figure — otherwise a "cost price" order
    // still loses us 20% of the goods. `costFromSupplierPrice` reads
    // `vat.registered` and is the only place that decision is made.
    const unit = kind === 'free' ? 0 : round(costFromSupplierPrice(l.cost, config))
    return { unitPrice: round(l.price), discountedUnitPrice: unit, quantity, lineTotal: round(unit * quantity) }
  })

  const total = round(priced.reduce((s, l) => s + l.lineTotal, 0))
  return {
    lines: priced,
    subtotal,
    total,
    discount: round(subtotal - total),
    // A founder code is not a tier and not a partner rate. Reporting it as
    // either would put it on a receipt as "8% off" and into a partner's ledger.
    tierPct: 0,
    tierLabel: null,
    partnerPct: 0,
    combinedPct: 0,
  }
}

/**
 * The delivery choices for an order being bought at a founder code's terms.
 *
 * Same two-option shape `deliveryOptions` returns, because Stripe fixes
 * shipping when the session is created and the postcode is not typed yet — see
 * that function for why the customer self-selects their zone.
 *
 * `free` charges nothing. `cost` charges what PowerBody charge US to ship this
 * parcel to that zone, which is usually MORE than the customer rate and often
 * more than the free rate of zero. That is the direction it is supposed to move
 * in: a cost-price order that ships on our customer rate has the goods at cost
 * and the postage at a loss.
 */
export function founderDeliveryOptions(
  kind: FounderCodeKind,
  order: {
    /** What we pay PowerBody for the goods, ex VAT (£) — what their bands read. */
    supplierValue: number
    /** What the member is being charged for the goods, inc VAT (£). */
    orderValue: number
  },
  config = getPricingConfig(),
): DeliveryOption[] {
  if (kind === 'unlock') return deliveryOptions(order.orderValue, config)
  if (kind === 'free') {
    return deliveryOptions(order.orderValue, config).map((o) => ({ ...o, price: 0 }))
  }
  return deliveryOptions(order.orderValue, config).map((o) => ({
    ...o,
    price: round(quoteDelivery({ supplierValue: order.supplierValue, zone: o.zone }, config).supplierCost),
  }))
}

/**
 * Whether this kind of code lets an order through under `minOrderValue`.
 *
 * All three of them do, and they have to: the minimum exists because a small
 * one-off loses money, and every one of these codes is a deliberate decision to
 * spend that money. A free code that still demanded a £15 basket would refuse
 * the £0.00 order it had just built.
 */
export function waivesMinimumOrder(_kind: FounderCodeKind): boolean {
  return true
}
