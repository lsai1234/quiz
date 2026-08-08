/**
 * Orders repository — the `orders` table (migration v3).
 *
 * The full `Order` document is stored as JSON in `data`; the indexed columns
 * (status, email, channel, stripe ids, supplier_order_id, timestamps) exist for
 * the hub's list/filter and for webhook lookups. `data` is the source of truth;
 * the columns are always written from it so they never drift.
 *
 * Server-only. Mirrors the dialect-neutral `?`-placeholder style of the other
 * repositories so it runs on SQLite and Postgres unchanged.
 */
import { getEngine, now } from '@/lib/db/engine'
import type { Order, OrderChannel, OrderStatus } from './types'

interface Row { data: string }

function parse(row: Row | undefined): Order | null {
  if (!row) return null
  try {
    return JSON.parse(row.data) as Order
  } catch {
    return null
  }
}

/** Insert or replace an order, keeping the indexed columns in sync with `data`. */
export async function saveOrder(order: Order): Promise<void> {
  const db = await getEngine()
  await db.run(
    `INSERT INTO orders
       (id, user_id, email, channel, status, data, stripe_session_id, stripe_payment_id, supplier_order_id, partner_code, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       user_id = excluded.user_id,
       email = excluded.email,
       channel = excluded.channel,
       status = excluded.status,
       data = excluded.data,
       stripe_session_id = excluded.stripe_session_id,
       stripe_payment_id = excluded.stripe_payment_id,
       supplier_order_id = excluded.supplier_order_id,
       partner_code = excluded.partner_code,
       updated_at = excluded.updated_at`,
    [
      order.id,
      order.userId,
      order.email,
      order.channel,
      order.status,
      JSON.stringify(order),
      order.stripeSessionId,
      order.stripePaymentIntentId,
      order.supplierOrderId,
      order.partnerCode ?? null,
      order.createdAt,
      order.updatedAt,
    ],
  )
}

export async function getOrder(id: string): Promise<Order | null> {
  const db = await getEngine()
  return parse(await db.get<Row>('SELECT data FROM orders WHERE id = ?', [id]))
}

export async function getOrderByStripeSession(sessionId: string): Promise<Order | null> {
  const db = await getEngine()
  return parse(await db.get<Row>('SELECT data FROM orders WHERE stripe_session_id = ?', [sessionId]))
}

/**
 * Find an order by its customer-facing reference (`CHRGD-…`).
 *
 * Scans rather than indexes: the reference lives in the JSON document, and
 * adding a column would need a migration for a lookup that happens a handful of
 * times per order. Revisit if the orders table ever gets large.
 */
export async function getOrderByReference(reference: string): Promise<Order | null> {
  const db = await getEngine()
  const rows = await db.all<Row>(
    "SELECT data FROM orders WHERE data LIKE ? ORDER BY created_at DESC LIMIT 50",
    [`%"reference":"${reference}"%`],
  )
  return rows.map(parse).find((o): o is Order => o?.reference === reference) ?? null
}

/**
 * Find the order behind a Stripe charge. Used to reconcile a refund or dispute
 * raised in the Stripe dashboard rather than the Founders Hub — the payment
 * intent is the only handle such an event gives us.
 */
export async function getOrderByPaymentIntent(paymentIntentId: string): Promise<Order | null> {
  const db = await getEngine()
  return parse(await db.get<Row>('SELECT data FROM orders WHERE stripe_payment_id = ?', [paymentIntentId]))
}

/**
 * Whether this email has ever bought before.
 *
 * The question a first-order-only partner code has to answer. Deliberately
 * counts anything past `pending_payment`: an abandoned checkout is not a
 * purchase, and holding it against someone would refuse a genuine new customer
 * their discount because they once got as far as the payment page.
 *
 * Matched on the indexed `email` column, lower-cased on both sides — Stripe
 * hands back whatever casing the customer typed.
 */
export async function hasOrdered(email: string): Promise<boolean> {
  const trimmed = email.trim().toLowerCase()
  if (!trimmed) return false
  const db = await getEngine()
  const row = await db.get<{ id: string }>(
    "SELECT id FROM orders WHERE LOWER(email) = ? AND status <> 'pending_payment' LIMIT 1",
    [trimmed],
  )
  return row != null
}

/** Every order attributed to a partner's code. The raw material of the ledger. */
export async function listOrdersByPartnerCode(code: string): Promise<Order[]> {
  const db = await getEngine()
  const rows = await db.all<Row>(
    'SELECT data FROM orders WHERE partner_code = ? ORDER BY created_at DESC LIMIT 1000',
    [code],
  )
  return rows.map((r) => parse(r)).filter((o): o is Order => o !== null)
}

/**
 * Pending-payment orders older than `cutoff` — abandoned checkouts to sweep.
 *
 * `checkout.session.expired` covers most of them, but webhooks are best-effort
 * and a missed one leaves a row that never resolves, so this is the backstop.
 */
export async function listStalePendingOrders(cutoffIso: string): Promise<Order[]> {
  const db = await getEngine()
  const rows = await db.all<Row>(
    "SELECT data FROM orders WHERE status = 'pending_payment' AND created_at < ? ORDER BY created_at ASC LIMIT 500",
    [cutoffIso],
  )
  return rows.map((r) => parse(r)).filter((o): o is Order => o !== null)
}

/**
 * Every order that has been paid for but never sent to the supplier — the raw
 * material of the daily fulfilment review.
 *
 * Filtered on the indexed `status` column and the `supplier_order_id` we already
 * write, so it stays a cheap query; the review state itself lives in the JSON
 * document and is applied by the caller (`buildFulfilmentQueue`), which also
 * lets orders written before the queue existed default to "needs review".
 * `failed` is included on purpose: a submit that errored is exactly the kind of
 * order a founder needs to see again.
 */
export async function listAwaitingFulfilment(limit = 500): Promise<Order[]> {
  const db = await getEngine()
  const rows = await db.all<Row>(
    `SELECT data FROM orders
      WHERE status IN ('paid', 'failed') AND supplier_order_id IS NULL
      ORDER BY created_at ASC LIMIT ${Math.min(Math.max(1, limit), 1000)}`,
  )
  return rows.map((r) => parse(r)).filter((o): o is Order => o !== null)
}

export interface OrderFilter {
  status?: OrderStatus
  channel?: OrderChannel
  limit?: number
}

export async function listOrders(filter: OrderFilter = {}): Promise<Order[]> {
  const db = await getEngine()
  const where: string[] = []
  const params: unknown[] = []
  if (filter.status) { where.push('status = ?'); params.push(filter.status) }
  if (filter.channel) { where.push('channel = ?'); params.push(filter.channel) }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const limit = filter.limit && filter.limit > 0 ? Math.min(filter.limit, 500) : 200
  const rows = await db.all<Row>(
    `SELECT data FROM orders ${clause} ORDER BY created_at DESC LIMIT ${limit}`,
    params,
  )
  return rows.map((r) => parse(r)).filter((o): o is Order => o !== null)
}

/** Load → mutate → save in one call. Returns the updated order (or null if gone). */
export async function updateOrder(id: string, mutate: (o: Order) => void): Promise<Order | null> {
  const order = await getOrder(id)
  if (!order) return null
  mutate(order)
  order.updatedAt = now()
  await saveOrder(order)
  return order
}
