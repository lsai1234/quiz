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
 *   accrued ─(window passes)─▶ confirmed ─(payout raised)─▶ invoiced ─(paid)─▶ paid
 *      └───────────────(refund)──▶ reversed ◀──(refund)──────────────┘
 *
 * `invoiced` is a state of its own because "we owe you this" and "we have sent
 * you this" are different facts. Collapsing them made the ledger claim money had
 * moved the moment a founder pressed a button rather than when it actually left.
 *
 * A `paid` row can still be reversed — money has left, and a later refund has to
 * be visible rather than silently absent. What it must never do is drop back
 * into the payable balance, which is why every transition names the states it is
 * allowed to leave.
 *
 * Server-only.
 */
import { commissionFor, confirmAfterFor, kindForOrder, renewalEarns, type CommissionKind } from './commission'
import { sortedHistory, termsInForce } from './terms'
import { buildInvoice, type SelfBilledInvoice } from './invoice'
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

  /**
   * Self-referral: a partner buying through their own code.
   *
   * The discount is theirs to use — they are a customer like anyone else and we
   * are not going to police a 20% code on a personal order. What they cannot do
   * is pay themselves commission for it, which would turn the code into a
   * standing extra discount funded out of the programme.
   *
   * Matched on email, which catches the honest case and the careless one. It
   * will not catch somebody using a second address, and it is not meant to —
   * that is a trust problem, not a validation problem, and the ledger makes it
   * visible either way.
   */
  if (order.email && order.email.trim().toLowerCase() === partner.email) {
    return {
      commission: null,
      reason: 'Their own order — the discount applied, but a partner does not earn commission on themselves.',
    }
  }

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
    if (await repo.setCommissionState(row.id, ['accrued', 'confirmed', 'invoiced', 'paid'], 'reversed')) reversed += 1
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
    invoiced: total('invoiced'),
    paid: total('paid'),
    reversed: total('reversed'),
    // Only `confirmed` is what the NEXT run would pay. An accrual could still be
    // refunded away, and an invoiced row is already on a raised payout — putting
    // either in this figure would either promise money that may never be theirs
    // or let a second run pay the same rows twice.
    payableNow: confirmed,
  }
}

export async function balanceFor(partnerId: string): Promise<PartnerBalance> {
  return summariseBalance(await repo.listCommissions(partnerId))
}

/**
 * The self-billed invoice behind one payout.
 *
 * Built from the rows every time rather than stored, so it can never disagree
 * with the ledger it describes.
 */
export async function invoiceFor(payoutId: string): Promise<SelfBilledInvoice | null> {
  const payout = await repo.getPayout(payoutId)
  if (!payout) return null

  const [partner, rows, history] = await Promise.all([
    repo.getPartner(payout.partnerId),
    repo.listCommissionsForPayout(payoutId),
    repo.listTerms(payout.partnerId),
  ])
  if (!partner) return null

  // The terms in force WHEN THE PAYOUT WAS RAISED — a VAT registration or a
  // minimum agreed since then does not restate an invoice already issued.
  const terms = termsInForce(history, new Date(payout.createdAt)) ?? sortedHistory(history).at(-1)
  if (!terms) return null

  return buildInvoice({ payout, partner, terms, rows, config: getPricingConfig() })
}

/**
 * Raise a payout for everything confirmed for one partner.
 *
 * Moves the rows to `invoiced`, not `paid` — this creates the obligation, it
 * does not send money. `markPaid` is what records the money actually leaving.
 *
 * Returns a reason rather than a payout when there is nothing to settle, or when
 * the balance is under their agreed minimum; below it the money carries forward,
 * which is what `payout.minimum` means.
 */
export async function settle(
  partnerId: string,
  period: string,
  opts: { ignoreMinimum?: boolean } = {},
): Promise<{ payoutId: string; amount: number; rows: number } | { payoutId: null; reason: string }> {
  const [confirmed, history] = await Promise.all([repo.listConfirmed(partnerId), repo.listTerms(partnerId)])
  if (confirmed.length === 0) return { payoutId: null, reason: 'Nothing confirmed to pay.' }

  const gross = Math.round(confirmed.reduce((s, r) => s + r.amount, 0) * 100) / 100
  const terms = termsInForce(history, new Date())
  const minimum = terms?.payout.minimum ?? 0

  if (!opts.ignoreMinimum && gross < minimum) {
    return {
      payoutId: null,
      reason: `£${gross.toFixed(2)} is under the £${minimum.toFixed(2)} minimum — it carries forward.`,
    }
  }

  const payout = await repo.createPayout({ partnerId, period, amount: gross })
  let rows = 0
  let settled = 0
  for (const row of confirmed) {
    // Guarded on `confirmed`, so a row reversed between the read above and here
    // is left alone rather than being invoiced from under the reversal.
    if (await repo.setCommissionState(row.id, ['confirmed'], 'invoiced', payout.id)) {
      rows += 1
      settled = Math.round((settled + row.amount) * 100) / 100
    }
  }

  // The payout is worth what actually moved onto it, not what the read said it
  // would be. Without this a refund landing mid-run would leave an invoice for
  // more than the rows behind it.
  if (settled !== gross) await repo.setPayoutAmount(payout.id, settled)

  return { payoutId: payout.id, amount: settled, rows }
}

/**
 * Record a payout actually being sent, and move its rows to `paid`.
 *
 * The reference is the bank/PayPal handle — the thing that answers "did this
 * arrive" months later, and the reason `reference` is on the payout rather than
 * being reconstructed from a statement.
 */
export async function markPaid(payoutId: string, reference: string | null): Promise<number> {
  const rows = await repo.listCommissionsForPayout(payoutId)
  let moved = 0
  for (const row of rows) {
    // Only from `invoiced`: a row reversed since the payout was raised stays
    // reversed, and the money simply is not sent for it.
    if (await repo.setCommissionState(row.id, ['invoiced'], 'paid')) moved += 1
  }
  await repo.markPayoutPaid(payoutId, reference)
  return moved
}

export interface RunReport {
  period: string
  paid: { partnerId: string; name: string; payoutId: string; amount: number; rows: number }[]
  skipped: { partnerId: string; name: string; reason: string }[]
  total: number
}

/**
 * Raise payouts for every partner with something confirmed — the monthly run.
 *
 * Each partner is judged against THEIR OWN minimum, from the terms in force for
 * them, rather than a programme-wide figure: the minimum is part of a deal that
 * can be negotiated, and a run that used the default would quietly pay someone
 * on different terms from the ones they were given.
 *
 * Everyone skipped is named with a reason. A run that silently did nothing for
 * a partner is how "where is my money" starts.
 */
export async function runPayouts(
  period: string,
  opts: { ignoreMinimum?: boolean } = {},
): Promise<RunReport> {
  const partners = await repo.listPartners()
  const report: RunReport = { period, paid: [], skipped: [], total: 0 }

  for (const partner of partners) {
    const result = await settle(partner.id, period, opts)
    if (result.payoutId === null) {
      // Nothing confirmed at all is the ordinary case for most partners most of
      // the time; it is not worth a line in the report.
      if (!/Nothing confirmed/.test(result.reason)) {
        report.skipped.push({ partnerId: partner.id, name: partner.name, reason: result.reason })
      }
      continue
    }
    report.paid.push({
      partnerId: partner.id,
      name: partner.name,
      payoutId: result.payoutId,
      amount: result.amount,
      rows: result.rows,
    })
    report.total = Math.round((report.total + result.amount) * 100) / 100
  }

  return report
}
