/**
 * The commission ledger — what a partner has earned, and how settled it is.
 *
 * An accrual is created when an attributed order is PAID, sits out the return
 * window, and only then becomes payable. Nothing here pays anyone; it records
 * what is owed and why, in a form that survives a rate change, a redelivered
 * webhook and a refund.
 *
 * States walk one way, with one exception:
 *
 *   accrued ──(window passes)──▶ confirmed ──(payout run)──▶ paid
 *      └──────(refund)──▶ reversed ◀──(refund)──┘
 *
 * A `paid` row can still be reversed — money has left, and a later refund has to
 * be visible rather than silently absent. What it must never do is drop back
 * into the payable balance, which is why every transition names the states it is
 * allowed to leave.
 *
 * Server-only.
 */
import { commissionFor, confirmAfterFor, kindForOrder, renewalEarns, type CommissionKind } from './commission'
import { termsInForce } from './terms'
import * as repo from './repo'
import { getPricingConfig } from '@/lib/stack-blueprint/pricing'
import type { Order } from '@/lib/orders/types'
import type { PartnerBalance, PartnerCommission } from './types'

export interface AccrualResult {
  /** The row written, or null when nothing was earned. */
  commission: PartnerCommission | null
  /** Why nothing was written — always sayable, never silent. */
  reason?: string
}

/**
 * Record what a partner earned on an order that has just been paid.
 *
 * Safe to call more than once for the same order: the unique index on
 * `(order_id, kind)` is what makes it so, not a check here, because two
 * redelivered webhooks can land at the same moment.
 *
 * `signupAt` is when the member's subscription started — needed to decide
 * whether a renewal is still inside the partner's earning window. Null for a
 * one-off, which has no window to be inside.
 */
export async function accrueForOrder(
  order: Order,
  opts: { signupAt?: string | null; isFirstForMember?: boolean } = {},
): Promise<AccrualResult> {
  if (!order.partnerCode) return { commission: null, reason: 'Not an attributed order.' }

  const resolved = await repo.getCode(order.partnerCode)
  if (!resolved) return { commission: null, reason: `No code ${order.partnerCode} on file.` }

  const partner = await repo.getPartner(resolved.partnerId)
  if (!partner) return { commission: null, reason: 'The partner no longer exists.' }

  // The terms in force ON THE ORDER'S DATE, not today's. A rate agreed last
  // month applies to last month's orders however many times this is re-run.
  const history = await repo.listTerms(partner.id)
  const terms = termsInForce(history, new Date(order.createdAt))
  if (!terms) return { commission: null, reason: 'The partner had no terms in force on that date.' }

  const kind: CommissionKind = kindForOrder(order, opts.isFirstForMember ?? true)

  if (kind === 'renewal') {
    if (!opts.signupAt) return { commission: null, reason: 'No signup date, so no renewal window to check.' }
    if (!renewalEarns(opts.signupAt, order.createdAt, terms.renewalMonths)) {
      return {
        commission: null,
        reason: `Past the ${terms.renewalMonths}-month renewal window from signup.`,
      }
    }
  }

  const config = getPricingConfig()
  const rate = kind === 'first' ? terms.firstOrderPct : terms.renewalPct
  const calc = commissionFor(order, rate, config)

  if (calc.amount <= 0) {
    // Worth saying out loud: an order this thin earns nothing, and the founder
    // should be able to find out why rather than wondering where the row went.
    return {
      commission: null,
      reason:
        calc.contribution <= 0
          ? `That order made £${calc.contribution.toFixed(2)} before commission, so there is nothing to share.`
          : 'The rate came to nothing on that order.',
    }
  }

  const commission = await repo.insertCommission({
    partnerId: partner.id,
    orderId: order.id,
    kind,
    netBasis: calc.netBasis,
    // Stored, never looked up again — see `PartnerCommission`.
    rate: calc.rate,
    amount: calc.amount,
    state: 'accrued',
    confirmAfter: confirmAfterFor(order.createdAt, config),
    payoutId: null,
  })

  if (!commission) return { commission: null, reason: 'Already accrued for this order.' }
  return { commission }
}

/**
 * Reverse every commission on an order — a refund, a cancellation, a dispute.
 *
 * Reverses from any state including `paid`: money that has left still has to be
 * visible as reversed rather than quietly absent from the ledger. Recovering it
 * is a conversation, not a database write, which is exactly why the return
 * window exists to make this rare.
 */
export async function reverseForOrder(orderId: string): Promise<number> {
  const rows = await repo.listCommissionsForOrder(orderId)
  let reversed = 0
  for (const row of rows) {
    if (row.state === 'reversed') continue
    if (await repo.setCommissionState(row.id, ['accrued', 'confirmed', 'paid'], 'reversed')) reversed += 1
  }
  return reversed
}

/**
 * Move every accrual whose return window has passed to `confirmed`.
 *
 * The daily job's work. Idempotent — a row already confirmed is not in
 * `accrued`, so a second run in the same day moves nothing.
 */
export async function confirmDue(asOf: Date = new Date()): Promise<number> {
  const due = await repo.listDueForConfirmation(asOf.toISOString())
  let confirmed = 0
  for (const row of due) {
    if (await repo.setCommissionState(row.id, ['accrued'], 'confirmed')) confirmed += 1
  }
  return confirmed
}

/** What a partner is owed, split by how settled it is. */
export function summariseBalance(rows: PartnerCommission[]): PartnerBalance {
  const total = (state: PartnerCommission['state']) =>
    Math.round(rows.filter((r) => r.state === state).reduce((s, r) => s + r.amount, 0) * 100) / 100

  const confirmed = total('confirmed')
  return {
    accrued: total('accrued'),
    confirmed,
    paid: total('paid'),
    reversed: total('reversed'),
    // Only `confirmed` is actually owed today. An accrual could still be
    // refunded away, and showing it as owed would promise a partner money that
    // may never be theirs.
    payableNow: confirmed,
  }
}

export async function balanceFor(partnerId: string): Promise<PartnerBalance> {
  return summariseBalance(await repo.listCommissions(partnerId))
}

/**
 * Settle everything confirmed for a partner into one payout.
 *
 * Returns null when there is nothing to settle, or when the balance is under
 * their agreed minimum — below it the money carries forward rather than being
 * paid, which is what `payout.minimum` means.
 */
export async function settle(
  partnerId: string,
  period: string,
  opts: { ignoreMinimum?: boolean } = {},
): Promise<{ payoutId: string; amount: number; rows: number } | { payoutId: null; reason: string }> {
  const [confirmed, history] = await Promise.all([repo.listConfirmed(partnerId), repo.listTerms(partnerId)])
  if (confirmed.length === 0) return { payoutId: null, reason: 'Nothing confirmed to pay.' }

  const amount = Math.round(confirmed.reduce((s, r) => s + r.amount, 0) * 100) / 100
  const terms = termsInForce(history, new Date())
  const minimum = terms?.payout.minimum ?? 0

  if (!opts.ignoreMinimum && amount < minimum) {
    return {
      payoutId: null,
      reason: `£${amount.toFixed(2)} is under the £${minimum.toFixed(2)} minimum — it carries forward.`,
    }
  }

  const payout = await repo.createPayout({ partnerId, period, amount })
  let rows = 0
  for (const row of confirmed) {
    // Guarded on `confirmed`, so a row that was reversed between the read and
    // here is left alone rather than being paid out from under the reversal.
    if (await repo.setCommissionState(row.id, ['confirmed'], 'paid', payout.id)) rows += 1
  }
  return { payoutId: payout.id, amount, rows }
}
