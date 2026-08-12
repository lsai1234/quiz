/**
 * The exit statement — what we actually sent, what they actually paid, and the
 * difference.
 *
 * WHY THIS EXISTS RATHER THAN THE MODEL
 * ─────────────────────────────────────
 * `cancelSettlement` computes the balance from the subscription's CURRENT state:
 * `flatMonthly × monthsActive` against `pricePerDelivery × deliveriesMade`. That
 * is fine as a forecast and wrong as a bill, because both figures move. A
 * supplier price rise in month four re-prices months one to three; a product
 * added in month five re-prices everything before it. A member who paid £30 for
 * four months and £40 for two is computed as having paid six lots of £40, and
 * the balance is out by the difference — in the member's favour on a rise, in
 * ours on a fall, which is the direction that produces a complaint.
 *
 * So the charge is built from what was written down at the time:
 *
 *   what we sent = Σ subscription orders · line prices AS RECORDED
 *   what they paid = Σ `billedAmount` · the invoice figure AS CHARGED
 *
 * Every awkward case then falls out by construction rather than by a special
 * case: a price change does not re-price the past because the past is a row; a
 * skipped box is not counted because no order shipped it; a paused month is not
 * counted because no invoice was raised; a refund subtracts itself.
 *
 * And it produces a STATEMENT rather than a formula — six boxes, five payments,
 * this difference — which matters more than the arithmetic being right. A
 * number someone can check is a number they argue with less.
 */
import type { Order } from '@/lib/orders/types'
import { getPricingConfig, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import { settlementIsClear } from './mock'

const round = (n: number) => Math.round(n * 100) / 100

/** One box we dispatched, as the member should see it. */
export interface StatementShipment {
  orderId: string
  reference: string | null
  at: string
  items: { title: string; quantity: number; value: number }[]
  /** Retail value of the box (£). */
  value: number
}

/** One payment they made. */
export interface StatementPayment {
  orderId: string
  at: string
  amount: number
}

export interface ExitStatement {
  shipments: StatementShipment[]
  payments: StatementPayment[]
  /** Everything dispatched, at the prices recorded on the day (£). */
  shippedTotal: number
  /** Everything charged, at the amounts the card was actually billed (£). */
  paidTotal: number
  /** `shippedTotal − paidTotal`, before any policy is applied (£). */
  rawGap: number
  /** Knocked off by the cap on what they have paid (£). 0 when it did not bite. */
  cappedBy: number
  /** Knocked off by the small-balance waiver (£). 0 when it did not apply. */
  waived: number
  /** What to charge (£). */
  settlement: number
  /**
   * What we owe THEM (£), when their payments have outrun their deliveries.
   *
   * Reachable in ordinary use: a member who paused, skipped boxes, or was
   * downsized can genuinely be in credit at the exit. Charging carefully in one
   * direction and quietly keeping the difference in the other is the fastest way
   * to lose the argument that this is a debt for goods rather than a fee.
   */
  overpayment: number
}

/**
 * The subscription orders that count, oldest first.
 *
 * Cancelled and failed orders are excluded — nothing shipped. Refunded ones too:
 * the money went back, so neither the goods nor the payment should sit in the
 * statement.
 */
export function billableSubscriptionOrders(orders: Order[]): Order[] {
  return orders
    .filter((o) => o.channel === 'subscription')
    .filter((o) => o.status !== 'cancelled' && o.status !== 'failed' && o.status !== 'refunded')
    .filter((o) => o.status !== 'pending_payment')
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/**
 * Build the statement from the member's own order history.
 *
 * Takes orders and a config, and deliberately NOT the subscription: the whole
 * point of this module is that the plan's current state gets no vote on what
 * already happened.
 */
export function exitStatement(
  orders: Order[],
  config: PricingConfig = getPricingConfig(),
): ExitStatement {
  const relevant = billableSubscriptionOrders(orders)

  const shipments: StatementShipment[] = relevant
    // A cycle that dispatched nothing is a payment, not a shipment. It still
    // appears below in `payments`.
    .filter((o) => o.lines.length > 0)
    .map((o) => ({
      orderId: o.id,
      reference: o.reference ?? null,
      at: o.createdAt,
      items: o.lines.map((l) => ({
        title: [l.title, l.variantTitle].filter(Boolean).join(' — '),
        quantity: l.quantity,
        value: round(l.unitPrice * l.quantity),
      })),
      value: round(o.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0)),
    }))

  const payments: StatementPayment[] = relevant
    .filter((o) => o.billedAmount != null && o.billedAmount > 0)
    .map((o) => ({ orderId: o.id, at: o.createdAt, amount: round(o.billedAmount!) }))

  const shippedTotal = round(shipments.reduce((s, x) => s + x.value, 0))
  const paidTotal = round(payments.reduce((s, x) => s + x.amount, 0))
  const rawGap = round(shippedTotal - paidTotal)

  return {
    shipments,
    payments,
    shippedTotal,
    paidTotal,
    rawGap,
    ...applyPolicies(rawGap, paidTotal, config),
    overpayment: rawGap < 0 ? round(-rawGap) : 0,
  }
}

/**
 * The cap and the waiver, applied to a raw gap.
 *
 * Split out and reported line by line so the statement can say WHY the figure is
 * what it is. "We capped this at what you have paid" is a sentence worth showing;
 * silently returning a smaller number is not.
 */
function applyPolicies(
  rawGap: number,
  paidTotal: number,
  config: PricingConfig,
): Pick<ExitStatement, 'cappedBy' | 'waived' | 'settlement'> {
  if (rawGap <= 0) return { cappedBy: 0, waived: 0, settlement: 0 }

  const cap = config.settlement.maxShareOfPaid
  const ceiling = cap == null ? Infinity : Math.max(0, paidTotal * cap)
  const capped = Math.min(rawGap, ceiling)
  const cappedBy = round(rawGap - capped)

  if (settlementIsClear(capped, config)) {
    return { cappedBy, waived: round(capped), settlement: 0 }
  }
  return { cappedBy, waived: 0, settlement: round(capped) }
}

/**
 * How far the ledger and the forecast disagree.
 *
 * The hub shows `cancelSettlement` as "what it would cost to leave today" while
 * a plan is running; this is what gets charged. They should land in the same
 * place, and a gap between them means one of the two is wrong about the plan's
 * history — worth surfacing to a founder rather than trusting the one that
 * happens to be cheaper.
 *
 * Not an assertion. A member whose plan predates the ledger legitimately has no
 * order history to read, and that is a `null` rather than a discrepancy.
 */
export function ledgerDivergence(
  statement: ExitStatement,
  forecast: number,
): { difference: number; material: boolean } | null {
  if (statement.shipments.length === 0 && statement.payments.length === 0) return null
  const difference = round(statement.settlement - forecast)
  return { difference, material: Math.abs(difference) > 1 }
}

/**
 * Whether we hold enough history to bill from the ledger at all.
 *
 * Plans that predate `billedAmount` have shipments but no payments, which would
 * compute as "they paid nothing and owe everything" — the single most damaging
 * way this could be wrong. Those members are settled from the forecast, or not
 * at all; they are never billed from a half-populated ledger.
 */
export function ledgerIsComplete(orders: Order[]): boolean {
  const relevant = billableSubscriptionOrders(orders)
  if (relevant.length === 0) return false
  return relevant.every((o) => o.billedAmount != null)
}

/** Convenience: the statement for a member, or the forecast when history is thin. */
export function settlementToCharge(
  orders: Order[],
  forecast: number,
  config: PricingConfig = getPricingConfig(),
): { amount: number; source: 'ledger' | 'forecast'; statement: ExitStatement | null } {
  if (!ledgerIsComplete(orders)) {
    return { amount: forecast, source: 'forecast', statement: null }
  }
  const statement = exitStatement(orders, config)
  return { amount: statement.settlement, source: 'ledger', statement }
}
