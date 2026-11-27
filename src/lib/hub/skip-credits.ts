/**
 * The credit for a skipped box, both ways.
 *
 * Skipping a box credits its value against the next payment (the Terms promise
 * it). Restoring it used to leave that credit where it was: the box shipped and
 * the member kept the credit, while the hub told them the credit "no longer
 * applies". Now each credited skip is recorded on the box (`skipCredit`), and
 * restoring the box takes exactly that back, once; skipping it again credits it
 * again, under a new number, so neither side can be paid twice by a replayed save.
 *
 * Pure: the route records the moves on the plan before saving it, and makes the
 * Stripe calls after (`/api/hub/subscription`). The records are the server's:
 * whatever the browser sends for them is replaced by what was stored.
 */
import type { DeliveryOverride, MemberSubscription } from '@/lib/recharge/types'
import { creditForSkippedBox } from '@/lib/recharge/schedule'

export interface BoxCreditMove {
  /** The box (`YYYY-MM`). */
  id: string
  amount: number
  /** Which credit this is for the box: part of the payment's idempotency key. */
  seq: number
}

export function boxCreditMoves(
  previous: MemberSubscription,
  next: MemberSubscription,
  opts: { billed: boolean; now?: Date },
): { subscription: MemberSubscription; credits: BoxCreditMove[]; debits: BoxCreditMove[] } {
  const credits: BoxCreditMove[] = []
  const debits: BoxCreditMove[] = []
  const overrides: Record<string, DeliveryOverride> = { ...(next.deliveryOverrides ?? {}) }
  const ids = new Set([...Object.keys(previous.deliveryOverrides ?? {}), ...Object.keys(overrides)])

  for (const id of ids) {
    const before = previous.deliveryOverrides?.[id]
    const after = overrides[id]
    // The records are the server's, whatever was sent.
    const record: Pick<DeliveryOverride, 'skipCredit' | 'skipSeq'> = { skipCredit: before?.skipCredit ?? null, skipSeq: before?.skipSeq ?? 0 }
    const wasSkipped = before?.skipped === true
    const isSkipped = after?.skipped === true

    if (isSkipped && !wasSkipped) {
      const amount = creditForSkippedBox(previous, id, opts.now)
      if (opts.billed && amount > 0) {
        const seq = (record.skipSeq ?? 0) + 1
        credits.push({ id, amount, seq })
        record.skipCredit = { amount, seq }
        record.skipSeq = seq
      }
    } else if (!isSkipped && wasSkipped && record.skipCredit) {
      debits.push({ id, amount: record.skipCredit.amount, seq: record.skipCredit.seq })
      record.skipCredit = null
    }

    if (after || record.skipCredit || record.skipSeq) {
      overrides[id] = { ...(after ?? {}), skipCredit: record.skipCredit ?? null, skipSeq: record.skipSeq ?? 0 }
    }
  }

  return { subscription: { ...next, deliveryOverrides: overrides }, credits, debits }
}
