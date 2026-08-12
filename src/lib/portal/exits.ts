/**
 * Exits, for the people who have to chase them.
 *
 * The member-facing side of an exit ends when the sheet closes. This side does
 * not: a settlement that was invoiced and declined is money owed, sitting on a
 * cancelled plan that nobody is looking at. Without a queue it is invisible —
 * and invisible unpaid balances are how a feature that was supposed to protect
 * margin quietly costs more than it recovers.
 *
 * Three states worth separating, because each wants a different action:
 *
 *   • **owed**     — invoiced, not paid. Chase, waive, or write off.
 *   • **collected**— paid. Evidence, nothing to do.
 *   • **waived**   — never charged, with a reason on the record.
 *
 * Pure: the caller reads the subscriptions and hands them in.
 */
import type { MemberSubscription, SubscriptionExit } from '@/lib/recharge/types'

const round = (n: number) => Math.round(n * 100) / 100

export type ExitState = 'owed' | 'collected' | 'waived' | 'written-off' | 'refund-due'

export interface ExitRow {
  userId: string
  email: string | null
  at: string
  /** What the exit came to (£). */
  settlement: number
  state: ExitState
  /** Why nothing was charged, when nothing was. */
  waiver: string | null
  /** What we owe THEM (£), when their payments outran their deliveries. */
  overpayment: number
  /** The Stripe invoice, when one was raised. */
  invoiceId: string | null
  /** Whether the figure came from the ledger or the forecast model. */
  source: 'ledger' | 'forecast'
  reason: string | null
  /** A founder's note, when they waived or wrote it off by hand. */
  note: string | null
}

export interface ExitQueue {
  rows: ExitRow[]
  /** Invoiced and unpaid (£) — the number that decides whether this is working. */
  owed: number
  collected: number
  waived: number
  writtenOff: number
  /** Refunds we owe departing members (£). */
  refundsDue: number
}

/**
 * The state of one exit.
 *
 * `writeOffAt`/`waivedByFounder` are set by the portal; everything else is what
 * the exit itself recorded. A settlement of zero with no waiver reason is still
 * `waived` — it cost nothing and there is nothing to chase.
 */
export function exitStateOf(exit: SubscriptionExit): ExitState {
  if (exit.writtenOffAt) return 'written-off'
  if ((exit.overpayment ?? 0) > 0 && !exit.refundedAt) return 'refund-due'
  if (exit.settlement <= 0) return 'waived'
  return exit.paid ? 'collected' : 'owed'
}

export function buildExitQueue(
  subscriptions: { userId: string; subscription: MemberSubscription }[],
): ExitQueue {
  const rows: ExitRow[] = subscriptions
    .filter((s): s is { userId: string; subscription: MemberSubscription & { exit: SubscriptionExit } } =>
      s.subscription.exit != null,
    )
    .map(({ userId, subscription }) => {
      const exit = subscription.exit
      return {
        userId,
        email: subscription.customerEmail ?? null,
        at: exit.at,
        settlement: round(exit.settlement),
        state: exitStateOf(exit),
        waiver: exit.waiver ?? null,
        overpayment: round(exit.overpayment ?? 0),
        invoiceId: exit.invoiceId ?? null,
        source: exit.source,
        reason: exit.reason ?? null,
        note: exit.note ?? null,
      }
    })
    // Newest first: an exit from this morning is the one worth acting on.
    .sort((a, b) => b.at.localeCompare(a.at))

  const sum = (state: ExitState, field: keyof Pick<ExitRow, 'settlement' | 'overpayment'> = 'settlement') =>
    round(rows.filter((r) => r.state === state).reduce((s, r) => s + r[field], 0))

  return {
    rows,
    owed: sum('owed'),
    collected: sum('collected'),
    waived: sum('waived'),
    writtenOff: sum('written-off'),
    refundsDue: sum('refund-due', 'overpayment'),
  }
}
