/**
 * What a partner earns on one order — the arithmetic, with no I/O.
 *
 * Three rules the rest of the programme rests on:
 *
 *   1. **Commission is a share of NET revenue**, ex VAT and ex delivery. Up to a
 *      fifth of a gross price is HMRC's money, and paying partners out of the
 *      VAT account is not a mistake anyone notices quickly.
 *   2. **The rate is whatever the partner was on THAT DAY.** It is passed in and
 *      stored on the row, never looked up when the ledger is read — change a
 *      rate next quarter and last quarter must not silently restate.
 *   3. **Commission can never be what makes an order a loss.** See `capped`.
 *
 * Pure, so all three are testable without a database.
 */
import { unitEconomics } from '@/lib/pricing/unit-economics'
import { getPricingConfig, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import type { Order } from '@/lib/orders/types'

/** A first order earns one rate; every renewal after it earns another. */
export type CommissionKind = 'first' | 'renewal'

export type CommissionState =
  /** Earned, inside the return window. Not yet payable. */
  | 'accrued'
  /** Window passed. Payable in the next run. */
  | 'confirmed'
  /** The order was refunded or cancelled. Never payable. */
  | 'reversed'
  | 'paid'

export interface CommissionCalc {
  /** Net revenue the rate was applied to (£). */
  netBasis: number
  /** The rate that applied on the day (0–1). */
  rate: number
  /** What the partner earns (£). */
  amount: number
  /** What the order itself makes, before commission (£). */
  contribution: number
  /**
   * True when the contribution guard bit — the uncapped rate would have paid
   * more than the order could afford, so the amount was reduced.
   */
  capped: boolean
  /** The amount before the guard, when it bit (£). */
  uncapped: number
}

/**
 * What the business actually keeps on an order, before any commission.
 *
 * Runs the same waterfall the pricing screens use — VAT, weight-banded
 * dropship delivery, card fees, returns provision — from the order's own
 * lines, so the guard below is judged against the real thing rather than an
 * average.
 */
export function contributionOf(order: Pick<Order, 'lines' | 'subtotal'>, config = getPricingConfig()): number {
  const shelf = order.lines.reduce((s, l) => s + l.unitPrice * Math.max(1, l.quantity), 0)
  const cost = order.lines.reduce(
    (s, l) => s + (l.supplierCost ?? 0) * Math.max(1, l.quantity),
    0,
  )
  const anyCostKnown = order.lines.some((l) => l.supplierCost != null)
  const grams = order.lines.reduce((s, l) => s + (l.weightGrams ?? 0) * Math.max(1, l.quantity), 0)

  return unitEconomics(
    {
      shelfPrice: shelf,
      // A line with no cost on file falls back to the configured ratio rather
      // than counting as free — an order that looks costless would let the
      // guard wave through a commission the margin cannot carry.
      supplierCost: anyCostKnown ? cost : null,
      grams: grams > 0 ? grams : null,
      /**
       * ONE. `sharedParcelItems` apportions one parcel's delivery across the
       * lines sharing it, and this call already IS the whole parcel — passing
       * the line count here divides the parcel cost by it and all but erases
       * the delivery. On a £90 three-item box that is the difference between
       * counting £7.87 of delivery and counting £0.13, which is most of the
       * margin the guard exists to protect.
       */
      sharedParcelItems: 1,
      freeDeliveryBasis: order.subtotal,
    },
    config,
  ).contribution
}

/** Net revenue on an order — what a rate is applied to. Ex VAT, ex delivery. */
export function netBasisOf(order: Pick<Order, 'lines'>, config = getPricingConfig()): number {
  const shelf = order.lines.reduce((s, l) => s + l.unitPrice * Math.max(1, l.quantity), 0)
  const net = config.vat.registered ? shelf / (1 + config.vat.standardRate) : shelf
  return round(net)
}

/**
 * Work out one commission, guard included.
 *
 * `rate` is the partner's rate ON THE DAY — the caller reads it from the terms
 * in force at the order's date, and it is then stored on the ledger row. This
 * function never goes looking for it.
 */
export function commissionFor(
  order: Pick<Order, 'lines' | 'subtotal'>,
  rate: number,
  config: PricingConfig = getPricingConfig(),
): CommissionCalc {
  const netBasis = netBasisOf(order, config)
  const contribution = round(contributionOf(order, config))
  const clean = Number.isFinite(rate) ? Math.min(1, Math.max(0, rate)) : 0
  const uncapped = round(netBasis * clean)

  /**
   * The contribution guard.
   *
   * A partner may take at most `maxShareOfContribution` of what the order
   * actually makes. On a deeply discounted order, net revenue and contribution
   * come apart badly — 15% of net can exceed the entire margin, and the
   * difference would come out of our own pocket with nothing to say so.
   *
   * On an order already losing money before commission the ceiling is zero:
   * there is nothing to share. That is not the guard rescuing a bad order — the
   * deepest stacked rung is a known acquisition cost (D2) — it is refusing to
   * make it worse by paying commission on top of a loss.
   */
  const ceiling = Math.max(0, round(contribution * config.partners.maxShareOfContribution))
  const amount = Math.min(uncapped, ceiling)

  return {
    netBasis,
    rate: clean,
    amount: round(amount),
    contribution,
    capped: amount < uncapped,
    uncapped,
  }
}

/** When a commission stops being reversible and becomes payable. */
export function confirmAfterFor(orderDate: string, config = getPricingConfig()): string {
  const at = new Date(orderDate)
  const days = Math.max(0, config.partners.confirmAfterDays)
  return new Date(at.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * Whether a renewal still earns.
 *
 * A partner earns on renewals for a fixed window from the member's signup —
 * `renewalMonths` on the terms in force. Counted from signup and not from the
 * order, so the window is a property of the relationship rather than something
 * a delayed delivery can extend.
 */
export function renewalEarns(
  signupAt: string,
  orderAt: string,
  renewalMonths: number,
): boolean {
  const signup = new Date(signupAt)
  const order = new Date(orderAt)
  if (Number.isNaN(signup.getTime()) || Number.isNaN(order.getTime())) return false
  const deadline = new Date(signup)
  deadline.setMonth(deadline.getMonth() + Math.max(0, renewalMonths))
  return order <= deadline
}

/** Which rate an order earns: the first-order rate once, the renewal rate after. */
export function kindForOrder(order: Pick<Order, 'channel'>, isFirstForMember: boolean): CommissionKind {
  // A one-off from the shop is always a "first": there is no renewal behind it.
  if (order.channel !== 'subscription') return 'first'
  return isFirstForMember ? 'first' : 'renewal'
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
