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

export type ExitState = 'owed' | 'collected' | 'waived' | 'written-off' | 'refund-due' | 'return-due'

/** One item we sent, as the person opening the returned parcel sees it. */
export interface ReturnableItem {
  /** Stable within one exit — `<shipmentIndex>:<itemIndex>`. What the UI ticks. */
  key: string
  title: string
  quantity: number
  /** Retail value of this line (£) — the basis the refund is apportioned on. */
  value: number
  /** When the box it came in was dispatched. */
  at: string
}

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

  // ── A statutory return, awaiting a parcel ─────────────────────────────────
  /** They cancelled inside 14 days and said they were sending it back. */
  returnRequested: boolean
  /** The MOST refundable (£) — a whole, unopened return. Never a promise. */
  refundCeiling: number
  /** What was actually refunded once the parcel was checked (£). Null until then. */
  refundPaid: number | null
  /** When it was refunded, so a processed return stops asking to be processed. */
  returnRefundedAt: string | null
  /**
   * Everything we sent them, tickable.
   *
   * Read off the statement snapshotted at the exit rather than the live orders,
   * for the reason that snapshot exists: what was sent, at the prices of the day,
   * cannot be re-derived through a catalogue that has moved on since.
   */
  returnItems: ReturnableItem[]
  /** Every payment taken (£) — the ceiling's origin, and what a full return returns. */
  paidTotal: number
  /** Everything sent at retail (£) — what the ticked values are a share of. */
  shippedTotal: number
}

/**
 * The shipments and totals off an exit's stored statement.
 *
 * `SubscriptionExit.statement` is typed `unknown` on purpose — it is a snapshot,
 * and a snapshot of a shape that has since changed must not crash a queue that
 * is only trying to list it. So this reads defensively and returns nothing it
 * cannot vouch for, rather than asserting a type onto stored JSON.
 */
export function returnablesFrom(statement: unknown): {
  items: ReturnableItem[]
  paidTotal: number
  shippedTotal: number
} {
  const empty = { items: [], paidTotal: 0, shippedTotal: 0 }
  if (!statement || typeof statement !== 'object') return empty
  const s = statement as {
    shipments?: { at?: string; items?: { title?: string; quantity?: number; value?: number }[] }[]
    paidTotal?: number
    shippedTotal?: number
  }
  if (!Array.isArray(s.shipments)) return empty

  const items: ReturnableItem[] = []
  s.shipments.forEach((shipment, si) => {
    if (!Array.isArray(shipment?.items)) return
    shipment.items.forEach((item, ii) => {
      items.push({
        key: `${si}:${ii}`,
        title: typeof item?.title === 'string' ? item.title : 'Item',
        quantity: typeof item?.quantity === 'number' ? item.quantity : 1,
        value: typeof item?.value === 'number' ? round(item.value) : 0,
        at: typeof shipment?.at === 'string' ? shipment.at : '',
      })
    })
  })

  return {
    items,
    paidTotal: typeof s.paidTotal === 'number' ? round(s.paidTotal) : 0,
    shippedTotal: typeof s.shippedTotal === 'number' ? round(s.shippedTotal) : 0,
  }
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
  /**
   * Parcels we are waiting on, at the most they could cost (£).
   *
   * A ceiling rather than a liability — most returns come back part-opened and
   * refund less — but it is the number that says how much of somebody else's
   * money is sitting in a queue, and that is the one worth having on the screen.
   */
  returnsAwaiting: number
  /** How many parcels that is. */
  returnsAwaitingCount: number
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
  // A parcel on its way beats every other state: nothing else on this exit can
  // be decided until someone has opened it, and it is the only state with a
  // deadline attached to somebody else's money.
  if (exit.returnRequested && !exit.returnRefundedAt) return 'return-due'
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
      const returnable = returnablesFrom(exit.statement)
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
        returnRequested: exit.returnRequested === true,
        refundCeiling: round(exit.refundDue ?? 0),
        refundPaid: exit.refundPaid ?? null,
        returnRefundedAt: exit.returnRefundedAt ?? null,
        returnItems: returnable.items,
        paidTotal: returnable.paidTotal,
        shippedTotal: returnable.shippedTotal,
      }
    })
    // Newest first: an exit from this morning is the one worth acting on.
    .sort((a, b) => b.at.localeCompare(a.at))

  const sum = (state: ExitState, field: keyof Pick<ExitRow, 'settlement' | 'overpayment'> = 'settlement') =>
    round(rows.filter((r) => r.state === state).reduce((s, r) => s + r[field], 0))

  const awaiting = rows.filter((r) => r.state === 'return-due')

  return {
    rows,
    owed: sum('owed'),
    collected: sum('collected'),
    waived: sum('waived'),
    writtenOff: sum('written-off'),
    refundsDue: sum('refund-due', 'overpayment'),
    returnsAwaiting: round(awaiting.reduce((s, r) => s + r.refundCeiling, 0)),
    returnsAwaitingCount: awaiting.length,
  }
}
