/**
 * Order lifecycle service.
 *
 * Pure-ish orchestration over the repo + the supplier provider:
 *   • createOrderFromCheckout — raise a paid order (from the Stripe webhook, or
 *     immediately in mock-payments mode).
 *   • submitOrderToSupplier   — send it to PowerBody for dropship fulfilment.
 *   • syncSupplierStatus      — pull supplier status/tracking back onto the order.
 *   • refundOrder / cancelOrder — terminal transitions.
 *
 * Every transition appends an audit event and is guarded so a bad call (e.g.
 * submitting an unpaid order) fails loudly rather than corrupting state.
 */
import crypto from 'crypto'
import { getSupplier } from '@/lib/supplier'
import { getOrderingSource } from '@/lib/supplier/ordering'
import { deliverability } from '@/lib/pricing/zones'
import { recurringDeliveryOption } from '@/lib/pricing/delivery'
import { shipsAtCycle } from '@/lib/recharge/clock'
import { cycleIsSkipped, removedLinesAtCycle } from '@/lib/recharge/schedule'
import type { SupplierOrderStatus, SupplierAddress, SupplierOrderInput } from '@/lib/supplier/types'
import { now } from '@/lib/db/engine'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { MemberSubscription } from '@/lib/recharge/types'
import {
  getOrder,
  getOrderByReference,
  listInFlightWithSupplier,
  listStalePendingOrders,
  saveOrder,
  updateOrder,
} from './repo'
import type {
  CreateOrderInput,
  Order,
  OrderLine,
  OrderStatus,
  OrderEvent,
  OrderReviewState,
} from './types'

const round = (n: number) => Math.round(n * 100) / 100

function event(type: string, detail?: string): OrderEvent {
  return { at: now(), type, ...(detail ? { detail } : {}) }
}

export function newOrderId(): string {
  return `ord_${crypto.randomBytes(9).toString('hex')}`
}

/**
 * A customer-facing order reference, e.g. `CHRGD-7K4M2XQP`.
 *
 * Crockford-style base32 (no I, L, O or U) so it survives being read down a
 * phone line without a 1/I or 0/O argument. Random rather than sequential: a
 * counter leaks how many orders the business takes and invites walking the
 * range, which is what OC-E-007 is guarding against.
 */
const REFERENCE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function newOrderReference(): string {
  const bytes = crypto.randomBytes(8)
  let out = ''
  for (let i = 0; i < 8; i++) out += REFERENCE_ALPHABET[bytes[i] % REFERENCE_ALPHABET.length]
  return `CHRGD-${out}`
}

/** The reference to show a customer. Falls back to the internal id for orders
 *  written before references existed, so nothing renders blank. */
export function orderReference(order: Pick<Order, 'id' | 'reference'>): string {
  return order.reference ?? order.id
}

/** Raise an order that has been (or is treated as) paid. Idempotent-friendly:
 *  pass a stable `id` and a repeated call updates the same row. */
export async function createOrderFromCheckout(input: CreateOrderInput): Promise<Order> {
  const subtotal = round(input.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0))
  const shipping = round(input.shipping ?? 0)
  const status: OrderStatus = input.status ?? 'paid'
  const order: Order = {
    id: input.id ?? newOrderId(),
    reference: newOrderReference(),
    channel: input.channel,
    status,
    userId: input.userId ?? null,
    email: input.email ?? null,
    currency: input.currency ?? 'GBP',
    subtotal,
    shipping,
    total: round(subtotal + shipping),
    lines: input.lines,
    shippingAddress: input.shippingAddress ?? null,
    stripeSessionId: input.stripeSessionId ?? null,
    stripePaymentIntentId: input.stripePaymentIntentId ?? null,
    // Every order starts unreviewed. Nothing reaches the supplier until a
    // founder says so — see `approveOrderForSupplier`.
    review: { state: 'pending', at: now() },
    supplierOrderId: null,
    supplierStatus: null,
    trackingNumber: null,
    partnerCode: input.partnerCode ?? null,
    partnerDiscountPct: input.partnerDiscountPct ?? null,
    founderCode: input.founderCode ?? null,
    founderCodeKind: input.founderCodeKind ?? null,
    billedAmount: input.billedAmount ?? null,
    subscription: input.subscription ?? null,
    events: [
      event('created', `channel=${input.channel}`),
      ...(input.partnerCode ? [event('attributed', `partner code ${input.partnerCode}`)] : []),
      // On the audit trail rather than only in a column: a £0.00 order needs to
      // say, in the same place every other transition is recorded, why it was
      // free.
      ...(input.founderCode
        ? [event('founder-code', `${input.founderCodeKind ?? 'founder'} code ${input.founderCode}`)]
        : []),
      ...(status === 'paid' ? [event('paid')] : []),
    ],
    createdAt: now(),
    updatedAt: now(),
  }
  await saveOrder(order)
  // An order raised already paid (mock checkout, subscription deliveries) earns
  // its commission here; one that starts pending earns it in `markOrderPaid`.
  if (status === 'paid') {
    await accrueCommission(order)
    await confirmByEmail(order)
  }
  return order
}

/**
 * Tell the customer their order went through.
 *
 * Sits next to the commission accrual and follows the same rule for the same
 * reason: **one funnel for every path.** Every route to a paid order — Stripe,
 * mock, the shop, the quiz — passes through `createOrderFromCheckout` or
 * `markOrderPaid`, so putting the email here means no future checkout can
 * quietly ship without one. Deduped on the order id inside the outbox, so the
 * two entry points and a redelivered webhook produce a single receipt.
 *
 * NEVER throws and never blocks the order, exactly like the accrual: money has
 * moved, and an email is not a reason to fail a request that took it.
 */
async function confirmByEmail(order: Order): Promise<void> {
  try {
    const { queueOrderConfirmation } = await import('@/lib/notify/commerce')
    await queueOrderConfirmation(order)
  } catch (err) {
    console.error('[orders] order confirmation email could not be queued:', err)
  }
}

/**
 * Record what a partner earned on an order that has just been paid.
 *
 * One funnel for every path — Stripe one-off, mock, subscription first box and
 * renewals — so no route can quietly skip attribution. Missing one means a
 * partner is under-paid and nothing says so.
 *
 * NEVER throws and never blocks the order. A commission is a bookkeeping entry;
 * a checkout that already took money must not fail because of one, and the
 * order carries `partnerCode` regardless, so a failed accrual can be replayed
 * from the orders themselves rather than being lost.
 */
async function accrueCommission(order: Order): Promise<void> {
  if (!order.partnerCode) return
  try {
    const { accrueForOrder } = await import('@/lib/partners/ledger')

    let signupAt: string | null = null
    let isFirstForMember = true

    if (order.channel === 'subscription' && order.userId) {
      const { hasEarlierSubscriptionOrder } = await import('./repo')
      isFirstForMember = !(await hasEarlierSubscriptionOrder(order.userId, order.createdAt))
      const { getSubscription } = await import('@/lib/db/hub-data')
      signupAt = (await getSubscription(order.userId))?.startedAt ?? null
    }

    await accrueForOrder(order, { signupAt, isFirstForMember })
  } catch (err) {
    console.error('[orders] commission accrual failed:', err)
  }
}

/**
 * The lines that actually dispatch on a given billing cycle.
 *
 * `cycle` is which delivery this is: 0 is the box that ships at signup, 1 the
 * first renewal, and so on. **Only lines due on that cycle are included** —
 * a three-month tub appears on cycles 0, 3, 6… and not on the months in between.
 *
 * That filter was missing, and its absence was a live over-shipping bug: every
 * renewal invoice raised an order containing every line at full quantity, so a
 * member on a three-month tub was sent one every month while paying a third of
 * its price each month. It also made the exit settlement fiction — that model
 * bills against `deliveriesMadeFor`, which says the tub ships once a quarter, so
 * it was describing a dispatch pattern the system did not actually perform.
 *
 * A cycle where nothing is due yields an EMPTY array, which is a real and
 * expected outcome for a plan of only multi-month items — see
 * `createSubscriptionOrder` for what happens to the order in that case.
 */
export function subscriptionOrderLines(
  sub: MemberSubscription,
  catalogue: CatalogueProduct[],
  cycle: number,
): OrderLine[] {
  // A box the member skipped is a box that does not ship — and therefore never
  // reaches the exit settlement, which counts what was dispatched rather than
  // what the cadence predicted. That is E-3 fixed by construction rather than by
  // a second subtraction somewhere downstream.
  if (cycleIsSkipped(sub, cycle)) return []
  // An item pulled out of THIS box, same reasoning one item down. `removedLineIds`
  // was previously read only by the hub's own calendar, so "remove from this box"
  // removed it from the member's picture of the box and shipped it regardless.
  const removed = removedLinesAtCycle(sub, cycle)
  return sub.lines.filter((line) => shipsAtCycle(line, cycle) && !removed.includes(line.id)).map((line) => {
    const product = catalogue.find((p) => p.id === line.productId)
    const variant =
      product?.variants.find((v) => (v.flavour || v.size || v.title) === line.variantTitle) ??
      product?.variants.find((v) => v.available) ??
      product?.variants[0]
    return {
      sku: variant?.sku ?? null,
      productId: line.productId,
      title: line.productTitle,
      variantTitle: line.variantTitle || null,
      quantity: line.quantity,
      unitPrice: round(line.pricePerDelivery / Math.max(1, line.quantity)),
      supplierCost: product?.cost ?? null,
    }
  })
}

/** Raise a paid subscription order (first box or a renewal). Idempotent when a
 *  stable id is passed (e.g. `ord_inv_<stripeInvoiceId>`). */
export async function createSubscriptionOrder(input: {
  id?: string
  userId?: string | null
  email?: string | null
  sub: MemberSubscription
  catalogue: CatalogueProduct[]
  stripeSubscriptionId?: string | null
  /** Where to ship it. Held on the subscription because Stripe asks once, at signup. */
  shippingAddress?: SupplierAddress | null
  /** The charge behind this invoice, so the order is refundable for real. */
  stripePaymentIntentId?: string | null
  /**
   * Which delivery this is: 0 for the box that ships at signup, 1 for the first
   * renewal, and so on. Decides which lines are actually due — see
   * `subscriptionOrderLines`.
   *
   * The caller owns this because the subscription's own clock has not moved yet
   * when the order is raised: the `invoice.paid` handler creates the order and
   * THEN advances the cycle, so `sub.monthsActive` is one behind at this point.
   */
  cycle: number
  /** What this cycle's invoice actually charged (£) — see `Order.billedAmount`. */
  billedAmount?: number | null
}): Promise<Order> {
  // Idempotency: if this invoice already produced an order, return it unchanged.
  // This also protects the cycle: a redelivered webhook arriving after the clock
  // advanced would compute a later cycle, and must not re-derive the lines.
  if (input.id) {
    const existing = await getOrder(input.id)
    if (existing) return existing
  }
  // The postage the member is actually paying on this plan, recorded on the
  // order the way a one-off records what checkout collected.
  //
  // It used to be left at zero, which was wrong in three directions at once. The
  // order's `total` understated what was taken; every financial reading of
  // delivery revenue counted subscriptions as contributing nothing; and the
  // fulfilment queue's `deliveryShortfall` compared a Zone 2 order's full due
  // against a recorded £0 and reported the whole charge as unpaid, when in fact
  // the member had paid the mainland rate and only the surcharge was short.
  //
  // Read from the plan's own monthly rather than stored, so it always matches
  // the rate `recurringDeliveryOption` put on the Stripe line at signup.
  const postage = recurringDeliveryOption(input.sub.flatMonthly)?.price ?? 0

  return createOrderFromCheckout({
    id: input.id,
    channel: 'subscription',
    userId: input.userId ?? null,
    email: input.email ?? input.sub.customerEmail ?? null,
    lines: subscriptionOrderLines(input.sub, input.catalogue, input.cycle),
    shipping: postage,
    shippingAddress: input.shippingAddress ?? input.sub.shippingAddress ?? null,
    stripePaymentIntentId: input.stripePaymentIntentId ?? null,
    status: 'paid',
    // Carried from the subscription onto every delivery it raises, first box and
    // renewals alike — a partner earns on renewals for a fixed window, and the
    // order is where that gets counted.
    partnerCode: input.sub.partnerCode ?? null,
    partnerDiscountPct: input.sub.partnerDiscountPct ?? null,
    // What the member paid for this cycle, recorded now because it cannot be
    // re-derived once the plan's price moves.
    billedAmount: input.billedAmount ?? null,
    // The terms this delivery went out under, so the review queue can tell a
    // first box from a renewal and show what the member is committing to
    // without going and reading the plan — which by then may have moved.
    subscription: {
      id: input.sub.id,
      cycle: input.cycle,
      monthly: input.sub.flatMonthly,
      minMonths: input.sub.minMonths,
      dispatchDayOfMonth: input.sub.dispatchDayOfMonth,
      introDiscountRate: input.sub.introDiscountRate ?? null,
      firstMonth: input.sub.firstMonth ?? null,
      startedAt: input.sub.startedAt,
    },
  })
}

/**
 * Claim the once-only conversion event for an order, by customer reference.
 *
 * Returns true for the caller that won the claim and false for everyone after —
 * so a refresh, a second tab or a shared link reports nothing (OC-F-090). The
 * flag lives on the order rather than in the browser precisely because
 * localStorage is per-device and a customer opening their confirmation on their
 * phone would otherwise count as a second sale.
 */
export async function markAnalyticsReported(reference: string): Promise<boolean> {
  const order = await getOrderByReference(reference)
  if (!order || order.analyticsReported) return false
  let claimed = false
  await updateOrder(order.id, (o) => {
    if (o.analyticsReported) return
    o.analyticsReported = true
    claimed = true
  })
  return claimed
}

/** Mark a pending order paid (webhook path when the order was pre-created). */
export async function markOrderPaid(
  id: string,
  payment: {
    stripeSessionId?: string
    stripePaymentIntentId?: string
    email?: string | null
    shippingAddress?: SupplierAddress | null
    /** What they chose to pay for delivery, when the processor collected it. */
    shipping?: number
  },
): Promise<Order | null> {
  let becamePaid = false
  const order = await updateOrder(id, (o) => {
    if (o.status !== 'pending_payment') return // idempotent — already progressed
    becamePaid = true
    o.status = 'paid'
    if (payment.shipping != null) {
      // The delivery rate they picked, which the order could not know before the
      // session existed. Re-derive the total rather than leaving it at the
      // figure we guessed with.
      o.shipping = round(payment.shipping)
      o.total = round(o.subtotal + o.shipping)
    }
    if (payment.stripeSessionId) o.stripeSessionId = payment.stripeSessionId
    if (payment.stripePaymentIntentId) o.stripePaymentIntentId = payment.stripePaymentIntentId
    if (payment.email && !o.email) o.email = payment.email
    if (payment.shippingAddress && !o.shippingAddress) o.shippingAddress = payment.shippingAddress
    o.events.push(event('paid'))
  })
  // Only on the transition. The accrual is idempotent anyway, but a redelivered
  // webhook should not be doing lookups it does not need.
  if (becamePaid && order) {
    await accrueCommission(order)
    // Queued here rather than in the webhook so that every route to a paid
    // order sends one — see `confirmByEmail`. The email address and the
    // delivery address only exist on the order from this moment, which is also
    // why it cannot be sent when the order was raised.
    await confirmByEmail(order)
  }
  return order
}

// ─── Daily fulfilment review ──────────────────────────────────────────────────
// We do not ask the supplier for anything until a human has looked at it. That
// is a deliberate business rule, not a missing feature: while the PowerBody
// integration is young, a wrong address or a stock surprise is far cheaper to
// catch here than after a parcel has shipped. It is enforced in the domain
// rather than by "nothing happens to call it yet", so adding a cron or a webhook
// later cannot quietly start dropshipping on its own.

/** An order's review state, defaulting to `pending` for orders written before it existed. */
export function reviewStateOf(order: Pick<Order, 'review'>): OrderReviewState {
  return order.review?.state ?? 'pending'
}

/** True when the order is waiting on a founder in the daily queue. */
export function awaitingReview(order: Pick<Order, 'status' | 'supplierOrderId' | 'review' | 'lines'>): boolean {
  if (order.supplierOrderId) return false
  if (order.status !== 'paid' && order.status !== 'failed') return false
  // Nothing to dispatch, so nothing to decide. A subscription cycle where every
  // line is a multi-month item that is not due raises a real order — it is the
  // record that this invoice was processed, and the ledger needs it — but it has
  // no lines, and putting an empty box in front of a founder to approve would be
  // asking them to sign off on nothing.
  if (order.lines.length === 0) return false
  return reviewStateOf(order) === 'pending'
}

async function setReview(
  id: string,
  state: OrderReviewState,
  opts: { by?: string | null; note?: string | null } = {},
): Promise<Order | null> {
  return updateOrder(id, (o) => {
    o.review = { state, at: now(), by: opts.by ?? null, note: opts.note ?? null }
    o.events.push(event(`review_${state}`, opts.note ?? undefined))
  })
}

/**
 * Confirm an order may be dropshipped. This is the gate `submitOrderToSupplier`
 * checks — approving does not itself send anything, so a founder can clear a
 * day's queue and let the send happen as its own step.
 */
export async function approveOrderForSupplier(id: string, by?: string | null, note?: string | null) {
  const order = await getOrder(id)
  if (!order) return null
  if (order.status !== 'paid' && order.status !== 'failed') {
    throw new Error(`Order ${id} is ${order.status} — only a paid order can be approved for fulfilment.`)
  }
  return setReview(id, 'approved', { by, note })
}

/**
 * Correct the delivery address on an order.
 *
 * Stripe collects this once, at checkout, and until now it was whatever landed
 * there for good. That is fine right up until it isn't: a customer types the
 * wrong postcode, Stripe's autofill hands over a billing address that was never
 * where they wanted the box, or somebody test-ordering to their own office
 * realises after paying. The order is the thing PowerBody ships against, so the
 * order has to be correctable.
 *
 * ── Why it stops at the supplier ────────────────────────────────────────────
 * Editable while the order is ours — `pending_payment` or `paid`. The moment it
 * has been sent, PowerBody holds a copy we cannot reach through `createOrder`,
 * and rewriting our row would make the hub confidently disagree with the parcel
 * actually in their picking queue. Refusing loudly and telling the founder to
 * ring the supplier is the honest failure; a silent local edit is the one that
 * ends with a box at the wrong house and a record saying otherwise.
 *
 * The old address goes into the audit event rather than being overwritten in
 * silence — "who changed it, when, and from what" is the whole point of keeping
 * a trail on an object that decides where goods go.
 */
export async function updateShippingAddress(
  id: string,
  input: SupplierAddress,
  by?: string | null,
): Promise<Order | null> {
  const order = await getOrder(id)
  if (!order) return null

  if (order.supplierOrderId || SUPPLIER_HELD_STATUSES.has(order.status)) {
    throw new Error(
      `Order ${id} has already gone to the supplier, who now holds the old address. ` +
        'Contact them to change it — editing it here would only make this record disagree with the parcel.',
    )
  }
  if (order.status === 'refunded' || order.status === 'cancelled') {
    throw new Error(`Order ${id} is ${order.status} — there is nothing left to deliver.`)
  }

  const address = normaliseShippingAddress(input)
  const previous = order.shippingAddress

  return updateOrder(id, (o) => {
    o.shippingAddress = address
    o.events.push(
      event(
        'address-updated',
        `${by ? `${by} set` : 'Set'} the delivery address to ${oneLineAddress(address)}` +
          (previous ? ` (was ${oneLineAddress(previous)})` : ' (none was recorded before)'),
      ),
    )
  })
}

/** Statuses where the supplier already has the address and we no longer own it. */
const SUPPLIER_HELD_STATUSES = new Set<OrderStatus>([
  'submitted_to_supplier',
  'supplier_confirmed',
  'shipped',
  'delivered',
])

function oneLineAddress(a: SupplierAddress): string {
  return [a.name, a.line1, a.line2, a.city, a.postcode].filter(Boolean).join(', ')
}

/**
 * Trim, require what the supplier requires, and refuse anything not in the UK.
 *
 * The email-or-phone rule is PowerBody's, not ours: couriers send the recipient
 * a verification code, and an address with neither is one they may fail to
 * deliver. `submitOrderToSupplier` would let it through — it only checks line1
 * and the postcode — so the check belongs here, where a person is looking at
 * the form and can actually supply the missing one.
 */
function normaliseShippingAddress(input: SupplierAddress): SupplierAddress {
  const text = (v: string | null | undefined) => (v ?? '').trim()
  const name = text(input.name)
  const line1 = text(input.line1)
  const city = text(input.city)
  const postcode = text(input.postcode).toUpperCase().replace(/\s+/g, ' ')
  const phone = text(input.phone) || null
  const email = text(input.email) || null

  const missing = [
    !name && 'a name',
    !line1 && 'the first address line',
    !city && 'a town or city',
    !postcode && 'a postcode',
  ].filter(Boolean) as string[]
  // Everything missing, in one sentence, rather than one field per attempt —
  // three round trips to learn three things is the worst way to fill a form.
  if (missing.length > 0) {
    const listed =
      missing.length === 1
        ? missing[0]
        : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`
    throw new Error(`The delivery address needs ${listed}.`)
  }

  const country = text(input.country) || 'GB'
  const reach = deliverability({ postcode, country })
  if (reach.excluded) {
    throw new Error(reach.reason ?? 'PowerBody will not dropship to that address.')
  }

  if (!phone && !email) {
    throw new Error(
      'The delivery address needs a phone number or an email — couriers send the recipient a verification code, and PowerBody require one of the two.',
    )
  }

  return {
    name,
    line1,
    line2: text(input.line2) || null,
    city,
    postcode,
    country: country.toUpperCase() === 'UK' ? 'GB' : country,
    phone,
    email,
  }
}

/** Park an order — a query on the address, a stock doubt — without rejecting it. */
export async function holdOrder(id: string, by?: string | null, note?: string | null) {
  return setReview(id, 'held', { by, note })
}

/** Put a held or rejected order back in the queue for a fresh decision. */
export async function returnOrderToQueue(id: string, by?: string | null, note?: string | null) {
  return setReview(id, 'pending', { by, note })
}

/**
 * Decide an order will not be fulfilled as it stands. Deliberately does NOT
 * refund or cancel: money is a separate decision with separate consequences, and
 * conflating them here would make a queue click move a customer's money.
 */
export async function rejectOrderForFulfilment(id: string, by?: string | null, note?: string | null) {
  return setReview(id, 'rejected', { by, note })
}

const SUBMITTABLE: OrderStatus[] = ['paid', 'failed']

/**
 * The provider to place this order against.
 *
 * In `simulate` mode the order goes to the MOCK supplier rather than being
 * short-circuited. That is deliberate: the mock records the order and answers
 * status and tracking for it, so a simulated order can be walked all the way
 * through the lifecycle — submit, sync, ship — which is the whole reason to run
 * a dry run instead of just not pressing the button. Nothing leaves the process
 * either way.
 */
async function supplierForOrdering(simulated: boolean) {
  if (!simulated) return getSupplier()
  const { createMockSupplier } = await import('@/lib/supplier/powerbody/mock')
  return createMockSupplier()
}

/**
 * Total shipped weight in kilograms, or null when any line's weight is unknown.
 *
 * All-or-nothing on purpose. PowerBody publish no weight on either product call,
 * so most catalogue products carry none unless a founder typed one in at import
 * review — and a partial sum is worse than no sum: it is a real number, in the
 * right units, describing only some of the parcel, and it would pick a delivery
 * band confidently and wrongly. Sending nothing lets them weigh it.
 */
export function orderWeightKg(
  lines: Pick<OrderLine, 'productId' | 'quantity'>[],
  catalogue: Pick<CatalogueProduct, 'id' | 'weightGrams'>[],
): number | null {
  let grams = 0
  for (const line of lines) {
    const product = catalogue.find((p) => p.id === line.productId)
    const each = product?.weightGrams
    if (each == null || !(each > 0)) return null
    grams += each * line.quantity
  }
  return grams > 0 ? Math.round(grams) / 1000 : null
}

/**
 * Build what the supplier needs to place — and to PRINT — this order.
 *
 * The picking list and invoice PowerBody put in the parcel name us as the
 * seller, so the product names, the prices the customer actually paid and our
 * delivery charge are part of the order rather than trimmings. Everything here
 * comes off the order itself; the catalogue is consulted only for the two facts
 * an order line doesn't carry (VAT rate and shipped weight).
 */
async function supplierOrderInputFor(order: Order, lines: OrderLine[]): Promise<SupplierOrderInput> {
  const address = order.shippingAddress!
  let catalogue: CatalogueProduct[] = []
  try {
    const { getResolvedCatalogue } = await import('@/lib/catalogue/resolve')
    catalogue = (await getResolvedCatalogue()).products
  } catch (err) {
    // A catalogue read that fails costs us the VAT rate and the weight, not the
    // order. Names and prices — the two the customer sees — are on the order.
    console.error('[orders] catalogue read failed while building supplier order:', err)
  }

  const { vatRateFor } = await import('@/lib/pricing/vat')
  const { getPricingConfig } = await import('@/lib/stack-blueprint/pricing')
  const config = getPricingConfig()

  return {
    reference: order.id,
    shippingAddress: {
      ...address,
      // Their guide wants an email OR a phone so couriers can send verification
      // codes. Stripe collects a phone; the email is the order's, and a
      // subscription raised before phone collection existed has only this.
      email: address.email ?? order.email ?? null,
    },
    shippingPrice: order.shipping,
    weightKg: orderWeightKg(lines, catalogue),
    comment: orderReference(order),
    lines: lines.map((line) => {
      const product = catalogue.find((p) => p.id === line.productId)
      return {
        sku: line.sku!,
        quantity: line.quantity,
        name: [line.title, line.variantTitle].filter(Boolean).join(' — '),
        unitPrice: line.unitPrice,
        // Their `tax` is a percentage; ours is a fraction, and a product with no
        // rate of its own is standard-rated.
        taxPercent: Math.round(vatRateFor(product, config) * 10000) / 100,
      }
    }),
  }
}

/**
 * Send the order to PowerBody for dropship fulfilment. Requires approval.
 *
 * Whether this actually reaches PowerBody depends on the ordering mode
 * (`SUPPLIER_ORDERING`, or Settings → Supplier → Order sending in the hub). In `simulate`
 * — the default — the order walks the exact same states and writes the same
 * audit trail against the mock supplier, but nothing reaches PowerBody and
 * nothing ships. The gate lives HERE rather than in the route so that a cron, a
 * webhook or a future caller cannot bypass it.
 */
export async function submitOrderToSupplier(id: string): Promise<Order | null> {
  const order = await getOrder(id)
  if (!order) return null
  if (!SUBMITTABLE.includes(order.status)) {
    throw new Error(`Order ${id} is ${order.status} — only paid or failed orders can be submitted.`)
  }
  if (reviewStateOf(order) !== 'approved') {
    throw new Error(
      `Order ${id} has not been approved for fulfilment (${reviewStateOf(order)}) — review it in the fulfilment queue first.`,
    )
  }
  const fulfilable = order.lines.filter((l) => l.sku)
  if (fulfilable.length === 0) {
    throw new Error(`Order ${id} has no lines with a supplier SKU to fulfil.`)
  }

  /**
   * An address we could actually ship to, checked HERE and not only in the queue.
   *
   * This used to fall back to an empty address — `line1: ''`, no postcode — and
   * send it, which is how a mock-checkout order with no address at all reached
   * the supplier looking like a real one. The queue does flag both of these, but
   * the queue is a screen; this is the gate, and it exists for the same reason
   * the approval check does: a cron or a future caller must not be able to get
   * past it by not having looked at the UI.
   */
  if (!order.shippingAddress?.line1 || !order.shippingAddress.postcode) {
    throw new Error(
      `Order ${id} has no delivery address — nothing can be dropshipped until one is on the order.`,
    )
  }
  const reach = deliverability(order.shippingAddress)
  if (reach.excluded) {
    throw new Error(`Order ${id} cannot be dropshipped: ${reach.reason}`)
  }

  // Resolved once, before the call, and then recorded on the order — so an order
  // sent as a simulation stays a simulation even after the switch is flipped.
  const simulated = getOrderingSource() === 'simulate'
  const supplier = await supplierForOrdering(simulated)
  try {
    const result = await supplier.placeOrder(await supplierOrderInputFor(order, fulfilable))
    return updateOrder(id, (o) => {
      o.supplierOrderId = result.supplierOrderId
      o.supplierStatus = result.status
      o.supplierSimulated = simulated
      o.status = 'submitted_to_supplier'
      o.events.push(
        event(
          'submitted_to_supplier',
          `${simulated ? 'SIMULATED — not sent to PowerBody · ' : ''}supplierOrderId=${result.supplierOrderId}`,
        ),
      )
    })
  } catch (err) {
    await updateOrder(id, (o) => {
      o.status = 'failed'
      o.events.push(event('submit_failed', err instanceof Error ? err.message : String(err)))
    })
    throw err
  }
}

/** Map the supplier's status onto ours. */
function orderStatusForSupplier(s: SupplierOrderStatus): OrderStatus {
  switch (s) {
    case 'received': return 'submitted_to_supplier'
    case 'processing': return 'supplier_confirmed'
    case 'shipped': return 'shipped'
    case 'delivered': return 'delivered'
    case 'cancelled': return 'cancelled'
  }
}

/** Pull the latest supplier status + tracking onto the order. */
export async function syncSupplierStatus(id: string): Promise<Order | null> {
  const order = await getOrder(id)
  if (!order) return null
  if (!order.supplierOrderId) throw new Error(`Order ${id} has not been submitted to the supplier yet.`)

  // A simulated order is synced against the same mock that accepted it. Asking
  // PowerBody about it would at best 404 and at worst match somebody else's
  // order id — and the flag is read from the ORDER, not from the current
  // setting, so flipping the switch to live cannot retarget yesterday's
  // simulations at the real API.
  const supplier = await supplierForOrdering(order.supplierSimulated === true)
  const supplierOrder = await supplier.getOrder(order.supplierOrderId)
  if (!supplierOrder) return order

  const mapped = orderStatusForSupplier(supplierOrder.status)
  return updateOrder(id, (o) => {
    const changed = o.supplierStatus !== supplierOrder.status || o.trackingNumber !== supplierOrder.trackingNumber
    o.supplierStatus = supplierOrder.status
    o.trackingNumber = supplierOrder.trackingNumber
    // Don't regress a terminal side-exit (cancelled/refunded).
    if (!['cancelled', 'refunded'].includes(o.status)) o.status = mapped
    if (changed) o.events.push(event('supplier_status', `${supplierOrder.status}${supplierOrder.trackingNumber ? ` · ${supplierOrder.trackingNumber}` : ''}`))
  })
}

/** What a status sweep did. */
export interface SupplierSweepResult {
  /** Orders asked about. */
  checked: number
  /** Orders whose supplier status or tracking number moved. */
  updated: number
  /** Orders that reached a delivered state on this run. */
  delivered: number
  /** Orders the supplier could not be asked about, with the reason. */
  failures: { id: string; error: string }[]
}

/**
 * Pull supplier status onto every order that is still in flight.
 *
 * `syncSupplierStatus` has always existed, but only ever ran when a founder
 * opened one order and pressed a button — so an order's status was only as
 * fresh as the last time somebody happened to look at it, and tracking numbers
 * arrived when they were chased rather than when the supplier had them. This is
 * the same call on a schedule: the daily job walks what is out there and asks.
 *
 * Deliberately NOT a place where anything gets sent. The sweep only reads from
 * the supplier and writes what came back — the approval gate in
 * `submitOrderToSupplier` is untouched, and a cron gaining the ability to
 * dispatch is exactly what that gate exists to prevent.
 *
 * One order's failure never stops the sweep. A supplier 404 on a single id, a
 * timeout, an order submitted against a sandbox that has since been reset — all
 * of them are one row's problem, and abandoning the rest of the run over any of
 * them would mean the whole thing stops working the first time one order goes
 * odd.
 */
export async function sweepSupplierStatuses(limit = 500): Promise<SupplierSweepResult> {
  const orders = await listInFlightWithSupplier(limit)
  const result: SupplierSweepResult = { checked: 0, updated: 0, delivered: 0, failures: [] }

  for (const order of orders) {
    result.checked += 1
    try {
      const before = { status: order.supplierStatus, tracking: order.trackingNumber }
      const after = await syncSupplierStatus(order.id)
      if (!after) continue
      if (after.supplierStatus !== before.status || after.trackingNumber !== before.tracking) {
        result.updated += 1
      }
      if (after.status === 'delivered') result.delivered += 1
    } catch (err) {
      result.failures.push({ id: order.id, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return result
}

export async function refundOrder(id: string, detail?: string): Promise<Order | null> {
  const order = await updateOrder(id, (o) => {
    o.status = 'refunded'
    o.events.push(event('refunded', detail))
  })
  // The money went back, so the commission does too — including one already
  // paid, which becomes a visible reversal rather than quietly vanishing.
  if (order?.partnerCode) {
    try {
      const { reverseForOrder } = await import('@/lib/partners/ledger')
      await reverseForOrder(order.id)
    } catch (err) {
      console.error('[orders] commission reversal failed:', err)
    }
  }
  return order
}

/**
 * Close out an order that never got paid — an expired or abandoned checkout.
 *
 * Guarded to `pending_payment` so a late `checkout.session.expired` can never
 * undo a payment that landed first; Stripe does not promise event order.
 */
export async function failOrder(id: string, detail?: string): Promise<Order | null> {
  return updateOrder(id, (o) => {
    if (o.status !== 'pending_payment') return
    o.status = 'failed'
    o.events.push(event('payment_not_completed', detail))
  })
}

/**
 * Sweep abandoned checkouts. `checkout.session.expired` handles these in the
 * normal case; this catches the ones whose webhook never arrived, so the orders
 * list and anything counting conversions off it stay truthful.
 */
export async function sweepStalePendingOrders(olderThanHours = 24, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - olderThanHours * 3600_000).toISOString()
  const stale = await listStalePendingOrders(cutoff)
  let closed = 0
  for (const order of stale) {
    const updated = await failOrder(order.id, `No payment ${olderThanHours}h after checkout started`)
    if (updated) closed += 1
  }
  return closed
}

export async function cancelOrder(id: string, detail?: string): Promise<Order | null> {
  return updateOrder(id, (o) => {
    o.status = 'cancelled'
    o.events.push(event('cancelled', detail))
  })
}
