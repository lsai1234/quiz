/**
 * Turns each payment journey's own numbers into one printed receipt.
 *
 * Three journeys end in a charge — the shop basket, the quiz stack, and the
 * bundle landing page — and until now each of them said "you paid" in its own
 * words, with its own rounding and its own idea of what a total is. The printer
 * is a single artefact, so this is a single mapping: journeys hand over what
 * they know, and the rules about what may be printed live here.
 *
 * Two of those rules are load-bearing:
 *
 *  1. **A stamp means money moved.** `PAYMENT APPROVED` is printed only from a
 *     confirmed, settled charge. A placed-but-unsettled order, a trial that
 *     takes nothing today, and a demo checkout each get their own honest stamp
 *     (OC-F-041, OC-E-009).
 *  2. **The column adds up.** A receipt that lists items whose amounts don't
 *     reach the total reads as a mistake in the customer's favour. Where a
 *     journey prices a plan flatly rather than per line — the monthly
 *     subscription does — the lines print with no amount at all rather than
 *     with amounts that invite the wrong sum.
 */
import type { ConfirmationResponse } from '@/lib/orders/confirmation'
import type { SubscriptionCheckout } from '@/lib/stack-blueprint/checkout'
import type { StackSlotEntry } from '@/lib/stack-blueprint'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { ChangePolicy } from '@/lib/recharge/types'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import type { ReceiptData, ReceiptItem, ReceiptRow } from './types'

const MERCHANT = {
  name: 'getCHRGD',
  strapline: 'Performance supplement stacks',
  // The live domain. Printed on every receipt and emailed to every customer, so
  // it has to be the address that actually resolves — `.com` was neither ours
  // nor reachable.
  site: 'getchrgd.co.uk',
} as const

const FOOTER = 'Thank you — stay charged'

/** `1234` → `£12.34`, from minor units, in the currency actually charged. */
export function money(minorUnits: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(minorUnits / 100)
}

/** Receipt dates are short and unambiguous: `13 Aug 2026`. */
export function receiptDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function receiptTime(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export function deliveryLabel(months: number): string {
  if (months <= 1) return 'every month'
  return `every ${months} months`
}

/**
 * A short reference for journeys that have no server-issued one — the mock
 * checkout paths. Derived from the clock so two demo receipts don't collide,
 * and prefixed `DEMO` so it can never be mistaken for an order reference in a
 * support inbox.
 *
 * Clock-derived, so hold it in a ref (as `CheckoutSuccess` does) rather than
 * deriving it on every render: a server render and its hydration would
 * otherwise print two different references at the same customer.
 */
export function demoReference(now: Date = new Date()): string {
  return `DEMO-${now.getTime().toString(36).slice(-6).toUpperCase()}`
}

function base(overrides: Partial<ReceiptData>): ReceiptData {
  return {
    merchant: MERCHANT,
    docTitle: 'Receipt',
    meta: [],
    shipTo: [],
    items: [],
    adjustments: [],
    total: null,
    charge: [],
    stamp: null,
    notes: [],
    reference: null,
    footer: FOOTER,
    ...overrides,
  }
}

// ─── Journey 1+2: the confirmed order (shop basket, quiz stack, bundles) ─────

/**
 * The receipt for a real, server-verified payment.
 *
 * Returns `null` for anything other than `confirmed`: the printer must not run
 * on a `processing` order (nothing has settled) or a `recovery` one (we don't
 * know that a charge exists at all). That refusal is the point — an animation
 * of a receipt printing is exactly the "styled to imply success" element
 * OC-F-002 forbids before the server has answered.
 */
export function receiptFromConfirmation(data: ConfirmationResponse): ReceiptData | null {
  if (data.state !== 'confirmed') return null
  const { order, subscription, personalisation } = data
  // A subscription signup has no order to print from — the first box's order is
  // raised later, by the `invoice.paid` webhook, under its own id. This branch
  // used to return null for exactly that reason, so the one journey that ends in
  // a recurring commitment was the one that produced no paperwork.
  if (!order) return subscription ? subscriptionReceipt(subscription, personalisation) : null

  const currency = order.currency
  const isSub = data.variant === 'personalised_subscription' || data.variant === 'standard_subscription'

  const meta: ReceiptRow[] = [
    { label: 'Order', value: order.reference },
    { label: 'Date', value: receiptDate(order.placedAt) },
  ]
  if (order.emailMasked) meta.push({ label: 'Email', value: order.emailMasked })
  if (personalisation?.goalPathLabel) {
    meta.push({ label: 'Stack', value: personalisation.goalPathLabel })
  }

  const items: ReceiptItem[] = order.lineItems.map((l) => ({
    name: l.name,
    qty: l.qty,
    amount: money(l.unitAmount * l.qty, currency),
  }))

  const adjustments: ReceiptRow[] = [
    { label: 'Subtotal', value: money(order.totals.subtotal, currency) },
  ]
  if (order.totals.discount > 0) {
    adjustments.push({ label: 'Discount', value: `−${money(order.totals.discount, currency)}`, tone: 'saving' })
  }
  adjustments.push({
    label: 'Delivery',
    value: order.totals.shipping > 0 ? money(order.totals.shipping, currency) : 'FREE',
    tone: order.totals.shipping > 0 ? 'default' : 'saving',
  })
  if (order.totals.tax > 0) {
    adjustments.push({ label: 'VAT included', value: money(order.totals.tax, currency), tone: 'muted' })
  }

  const charge: ReceiptRow[] = []
  const notes: string[] = []

  if (subscription) {
    // A trial takes nothing today. Printing "recurring £x" next to a total of
    // £0.00 with no explanation is the misreading OC-F-041 exists to prevent,
    // so the trial's end date and its first real amount are printed together.
    if (subscription.trial) {
      charge.push({ label: 'Free trial until', value: receiptDate(subscription.trial.endsAt) })
      charge.push({ label: 'Then', value: money(subscription.trial.thenAmount, currency) })
    } else {
      charge.push({ label: `Recurring ${subscription.cadenceLabel.toLowerCase()}`, value: money(subscription.recurringAmount, currency) })
    }
    if (subscription.nextBillingDate) {
      charge.push({ label: 'Next payment', value: receiptDate(subscription.nextBillingDate) })
    }
    if (subscription.nextDispatchDate) {
      charge.push({ label: 'Next delivery', value: receiptDate(subscription.nextDispatchDate) })
    }
    // One rhythm needs no explaining; two or more do (OC-F-044).
    if (subscription.cadenceGroups.length > 1) {
      notes.push('Your items arrive on their own schedules — one payment covers them all.')
      for (const group of subscription.cadenceGroups) {
        notes.push(`${group.label}: ${group.items.join(', ')}`)
      }
    }
    notes.push('Cancel any time before your next payment from your account.')
  }

  if (order.deliveryEstimate) {
    notes.push(`Expected ${receiptDate(order.deliveryEstimate.from)} – ${receiptDate(order.deliveryEstimate.to)}.`)
  }
  if (order.refunded) notes.push('A refund has been issued against this order.')

  // The address is on the receipt because that is where someone checks it, and
  // the window for fixing it is short enough to be worth printing next to it.
  const address = order.shippingAddress
  const shipTo = address
    ? [
        address.name,
        address.line1,
        address.line2 ?? '',
        `${address.city} ${address.postcode}`.trim(),
      ].filter((line) => line.trim().length > 0)
    : []
  if (shipTo.length > 0) {
    notes.push('Something wrong? Email us within 12 hours and we’ll change it before it ships.')
  }

  return base({
    docTitle: isSub ? 'Subscription receipt' : 'Order receipt',
    meta,
    shipTo,
    items,
    adjustments,
    total: { label: order.refunded ? 'Order total' : 'Total paid', value: money(order.totals.total, currency) },
    charge,
    // The one place the stamp is earned: Stripe said paid, and the server
    // checked rather than trusting the redirect (OC-F-010).
    stamp: subscription?.trial ? 'Trial started' : 'Payment approved',
    notes,
    reference: order.reference,
  })
}

/**
 * The receipt for a plan that has just started, with no order behind it yet.
 *
 * Everything a subscriber is owed in writing at the moment they commit: what
 * they signed up to, what came off the card today, what recurs and when, where
 * it ships, and how to stop it. The lines print WITHOUT amounts — rule 2 at the
 * top of this file — because a flat monthly is not the sum of its products, and
 * printing per-item prices next to a total they don't reach reads as an error in
 * the customer's favour.
 *
 * The stamp is earned the same way as any other: this is only reached from a
 * `confirmed` state, which means Stripe itself said the session was paid.
 */
function subscriptionReceipt(
  subscription: NonNullable<ConfirmationResponse['subscription']>,
  personalisation: ConfirmationResponse['personalisation'],
): ReceiptData {
  const currency = subscription.currency

  const meta: ReceiptRow[] = [
    { label: 'Plan', value: subscription.reference },
    { label: 'Started', value: receiptDate(subscription.startedAt) },
  ]
  if (subscription.emailMasked) meta.push({ label: 'Email', value: subscription.emailMasked })
  if (personalisation?.goalPathLabel) meta.push({ label: 'Stack', value: personalisation.goalPathLabel })

  const items: ReceiptItem[] = subscription.lines.map((line) => ({
    name: line.name,
    qty: line.qty,
    amount: null,
    note: deliveryLabel(line.cadenceMonths),
  }))

  const charge: ReceiptRow[] = [
    { label: `Recurring ${subscription.cadenceLabel.toLowerCase()}`, value: money(subscription.recurringAmount, currency) },
  ]
  if (subscription.nextBillingDate) {
    charge.push({ label: 'Next payment', value: receiptDate(subscription.nextBillingDate) })
  }
  if (subscription.nextDispatchDate) {
    charge.push({ label: 'Next delivery', value: receiptDate(subscription.nextDispatchDate) })
  }

  const notes: string[] = []
  if (subscription.cadenceGroups.length > 1) {
    notes.push('Your items arrive on their own schedules — one payment covers them all.')
    for (const group of subscription.cadenceGroups) {
      notes.push(`${group.label}: ${group.items.join(', ')}`)
    }
  }
  notes.push(
    subscription.minMonths > 1
      ? `${subscription.minMonths}-month minimum term, then cancel any time before your next payment.`
      : 'Cancel any time before your next payment from your account.',
  )

  const address = subscription.shippingAddress
  const shipTo = address
    ? [address.name, address.line1, address.line2 ?? '', `${address.city} ${address.postcode}`.trim()]
        .filter((line) => line.trim().length > 0)
    : []
  if (shipTo.length > 0) {
    notes.push('Something wrong? Email us within 12 hours and we’ll change it before it ships.')
  }

  return base({
    docTitle: 'Subscription receipt',
    meta,
    shipTo,
    items,
    // What Stripe actually took today — month one is rarely the monthly figure,
    // with an intro rate or a partner's code on it. Omitted rather than guessed
    // at when the session didn't say.
    total:
      subscription.firstPayment != null
        ? { label: 'Charged today', value: money(subscription.firstPayment, currency) }
        : null,
    charge,
    stamp: 'Payment approved',
    notes,
    reference: subscription.reference,
  })
}

// ─── Journey 3: the in-page mock checkout (stack review + bundle landing) ────

/**
 * A one-off stack's printed lines, priced from the same variant the checkout
 * sends: the chosen one, else the first in stock, else the first there is —
 * the resolution order the review screen and `validateCheckout` both use.
 */
export function receiptItemsFromSlots(
  slots: StackSlotEntry[],
  products: CatalogueProduct[],
): ReceiptItem[] {
  return slots.map((slot) => {
    const product = products.find((p) => p.id === slot.selectedProductId)
    const variant =
      product?.variants.find((v) => v.id === slot.selectedVariantId)
      ?? product?.variants.find((v) => v.available)
      ?? product?.variants[0]
    return {
      name: product?.title ?? slot.title,
      qty: 1,
      amount: formatGBP(variant?.price ?? product?.basePrice ?? 0),
    }
  })
}

export interface StackReceiptInput {
  plan: 'oneoff' | 'subscription'
  subscription?: SubscriptionCheckout
  /** One-off stacks price per line, so their amounts print and add up. */
  oneOff?: { items: ReceiptItem[]; subtotal: number; total: number }
  changePolicy?: ChangePolicy
  /** No money moved — the stamp says so. */
  mock: boolean
  reference?: string | null
  now?: Date
}

/**
 * The receipt for a checkout that completed inside the page: today, only the
 * mock payment path, which is why `mock` has no default. A real card payment
 * leaves for Stripe and comes back to `receiptFromConfirmation`.
 */
export function receiptFromStackCheckout(input: StackReceiptInput): ReceiptData {
  const now = input.now ?? new Date()
  const isSub = input.plan === 'subscription' && !!input.subscription
  const sub = input.subscription
  const reference = input.reference ?? demoReference(now)

  const meta: ReceiptRow[] = [
    { label: 'Order', value: reference },
    { label: 'Date', value: `${receiptDate(now)} ${receiptTime(now)}` },
    { label: 'Plan', value: isSub ? 'Monthly subscription' : 'One-off bundle' },
  ]

  const items: ReceiptItem[] = isSub && sub
    ? sub.lines.map((line) => ({
        name: line.productTitle,
        qty: line.quantity,
        // Flat monthly plan: the lines are a delivery schedule, not a price
        // breakdown. Amounts here would never sum to the monthly total.
        amount: null,
        note: deliveryLabel(line.deliveryIntervalMonths),
      }))
    : (input.oneOff?.items ?? [])

  const adjustments: ReceiptRow[] = []
  const charge: ReceiptRow[] = []
  const notes: string[] = []

  if (isSub && sub) {
    if (sub.introDiscountPct > 0 && sub.firstMonth < sub.flatMonthly) {
      charge.push({ label: `First month (${sub.introDiscountPct}% off)`, value: formatGBP(sub.firstMonth), tone: 'saving' })
    }
    charge.push({ label: 'Then per month', value: `${formatGBP(sub.flatMonthly)}/mo` })
    if (sub.minMonths > 1) {
      charge.push({ label: `${sub.minMonths}-month minimum`, value: formatGBP(sub.minTermTotal), tone: 'muted' })
      notes.push(`${sub.minMonths}-month minimum term (${formatGBP(sub.minTermTotal)} total), then cancel any time.`)
    } else {
      notes.push('Cancel or pause any time before your next payment.')
    }
    notes.push(
      input.changePolicy === 'remove'
        ? 'If an item is unavailable we’ll take it off your plan and lower your monthly from the next payment.'
        : 'If an item is unavailable we’ll swap in the closest match at the same or lower price, so your monthly doesn’t change.',
    )
  } else if (input.oneOff) {
    const saving = Math.round((input.oneOff.subtotal - input.oneOff.total) * 100) / 100
    adjustments.push({ label: 'Subtotal', value: formatGBP(input.oneOff.subtotal) })
    if (saving > 0.01) {
      adjustments.push({ label: 'Discount', value: `−${formatGBP(saving)}`, tone: 'saving' })
    }
  }

  if (input.mock) {
    notes.push('Demo mode — no payment was taken and nothing will be dispatched.')
  }

  // Never "charged today" on a receipt for a charge that didn't happen.
  const total = isSub && sub
    ? { label: input.mock ? 'First payment' : 'Charged today', value: formatGBP(sub.firstMonth) }
    : input.oneOff
      ? { label: input.mock ? 'Order total' : 'Total paid', value: formatGBP(input.oneOff.total) }
      : null

  return base({
    docTitle: isSub ? 'Subscription receipt' : 'Order receipt',
    meta,
    items,
    adjustments,
    total,
    charge,
    stamp: input.mock ? 'Demo — not charged' : 'Payment approved',
    notes,
    reference,
  })
}

// ─── Journey 4: the scroll-story bundle (demo checkout) ─────────────────────

export interface DemoBundleReceiptInput {
  items: ReceiptItem[]
  /** Major units, as the scroll story prices them. */
  subtotal: number
  discount: number
  discountPct: number
  total: number
  /** Printed in the meta block when the quiz produced one. */
  stackName?: string | null
  now?: Date
}

/**
 * The scroll story's bundle checkout.
 *
 * Its stamp is unconditional, unlike the other builders': that journey's
 * "checkout" sets a local flag and never contacts a payment provider at all
 * (see `useLocalCart`), so there is no configuration under which it could print
 * an approval. A receipt is the last place to start rounding that up.
 */
export function receiptFromDemoBundle(input: DemoBundleReceiptInput): ReceiptData {
  const now = input.now ?? new Date()
  const reference = demoReference(now)

  const meta: ReceiptRow[] = [
    { label: 'Order', value: reference },
    { label: 'Date', value: `${receiptDate(now)} ${receiptTime(now)}` },
    { label: 'Plan', value: 'Monthly subscription' },
  ]
  if (input.stackName) meta.push({ label: 'Stack', value: input.stackName })

  const adjustments: ReceiptRow[] = [{ label: 'Subtotal', value: `${formatGBP(input.subtotal)}/mo` }]
  if (input.discount > 0.01) {
    adjustments.push({
      label: `Subscribe & save (${input.discountPct}% off)`,
      value: `−${formatGBP(input.discount)}`,
      tone: 'saving',
    })
  }

  return base({
    docTitle: 'Subscription receipt',
    meta,
    items: input.items,
    adjustments,
    total: { label: 'Monthly total', value: `${formatGBP(input.total)}/mo` },
    charge: [],
    stamp: 'Demo — not charged',
    notes: ['Demo preview — no payment was taken. The shop and the quiz stack builder are the live checkouts.'],
    reference,
  })
}
