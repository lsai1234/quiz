/**
 * The order-confirmation contract.
 *
 * Implements §2.1 (variant resolution), §3.1 (payment state) and §4.2 (response
 * shape) of docs/ORDER_CONFIRMATION_SPEC.md.
 *
 * Two rules shape everything here:
 *
 *  1. **The screen is a presentation layer, not a source of truth.** Nothing in
 *     this file fulfils anything, charges anything or advances any state. It
 *     reads what the webhooks already wrote. Loading the confirmation page a
 *     hundred times must have no side effect beyond the once-only analytics flag.
 *
 *  2. **Confirmation is earned, never assumed.** The default answer is
 *     `recovery`. A caller gets `confirmed` only by presenting a session that
 *     Stripe itself says is paid. Arrival at the success URL proves nothing —
 *     anyone can type it.
 *
 * Server-only: it holds the Stripe secret key and reads other people's orders,
 * so the route in front of it does the authorisation and rate limiting.
 */
import type Stripe from 'stripe'
import { getPaymentSource } from '@/lib/payments'
import { getOrder } from './repo'
import { orderReference } from './service'
import { getSubscription } from '@/lib/db/hub-data'
import type { MemberSubscription } from '@/lib/recharge/types'
import type { Order, OrderLine } from './types'

// ─── The response contract (§4.2) ────────────────────────────────────────────

export type ConfirmationState = 'confirmed' | 'processing' | 'recovery'

export type ConfirmationVariant =
  | 'personalised_bundle' // V1
  | 'personalised_subscription' // V2
  | 'standard_subscription' // V3
  | 'standard' // V4
  | 'mixed' // V5

export interface ConfirmationLine {
  sku: string | null
  name: string
  qty: number
  /** Minor units (pence), as charged. */
  unitAmount: number
  isBundleComponent: boolean
}

export interface ConfirmationTotals {
  subtotal: number
  discount: number
  shipping: number
  tax: number
  total: number
}

export interface ConfirmationOrder {
  reference: string
  placedAt: string
  /** e.g. `l•••@gmail.com` — enough to spot a typo, not enough to leak an address. */
  emailMasked: string | null
  currency: string
  totals: ConfirmationTotals
  lineItems: ConfirmationLine[]
  shippingAddress: Order['shippingAddress']
  deliveryEstimate: { from: string; to: string } | null
  /** Set once a refund has been applied, so a revisit tells the truth (OC-E-006). */
  refunded?: boolean
  status: Order['status']
}

export interface ConfirmationSubscription {
  cadenceLabel: string
  /** Minor units. */
  recurringAmount: number
  nextBillingDate: string | null
  nextDispatchDate: string | null
  trial: { endsAt: string; thenAmount: number } | null
  manageUrl: string | null
  /** Each distinct shipping rhythm, listed separately (OC-F-044). */
  cadenceGroups: { label: string; items: string[] }[]

  // ── What a receipt needs, when the subscription IS the whole confirmation ──
  //
  // A subscription signup has no order to print from: the order is raised later
  // by the `invoice.paid` webhook under its own id, so the confirmation screen
  // arrives before one exists and, for a while, printed nothing at all — a one-off
  // buyer got a receipt and a member starting a monthly plan got a heading.
  //
  /** Member-facing reference for the plan, e.g. `SUB-7F3A91`. */
  reference: string
  /** When the plan started — the receipt's date line. */
  startedAt: string
  /** e.g. `l•••@gmail.com`, on the same masking rule as an order's. */
  emailMasked: string | null
  currency: string
  /** What Stripe actually took today, in minor units. Null until it has. */
  firstPayment: number | null
  /** Where the boxes go, once Stripe has collected it. */
  shippingAddress: Order['shippingAddress']
  /** The plan's lines as a delivery schedule — no amounts. See `receiptFromConfirmation`. */
  lines: { name: string; qty: number; cadenceMonths: number }[]
  /** A minimum term, when the plan has one. */
  minMonths: number
}

export interface ConfirmationPersonalisation {
  firstName: string | null
  goalPathLabel: string | null
  rationale: { sku: string | null; name: string; claimId: string; copy: string }[]
  protocol: { timeOfDay: string; name: string; dose: string }[]
  planUrl: string | null
}

export interface ConfirmationResponse {
  state: ConfirmationState
  variant: ConfirmationVariant | null
  order: ConfirmationOrder | null
  subscription: ConfirmationSubscription | null
  personalisation: ConfirmationPersonalisation | null
  analytics: { transactionId: string; alreadyReported: boolean; journeyVariant: string } | null
}

/** The default answer. Never assume more than this without evidence. */
export const RECOVERY: ConfirmationResponse = {
  state: 'recovery',
  variant: null,
  order: null,
  subscription: null,
  personalisation: null,
  analytics: null,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** `lewis@gmail.com` → `l•••@gmail.com` (OC-F-021). */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null
  const at = email.indexOf('@')
  if (at <= 0) return null
  return `${email[0]}•••${email.slice(at)}`
}

const round = (n: number) => Math.round(n * 100)

/**
 * Dispatch SLA rather than a promised date. OC-F-023 is explicit that a specific
 * date may only be shown when it is guaranteed, and ours is not — the supplier
 * dropships on their own schedule.
 */
export function deliveryEstimate(placedAt: string): { from: string; to: string } | null {
  const placed = new Date(placedAt)
  if (Number.isNaN(placed.getTime())) return null
  const day = (offset: number) => {
    const d = new Date(placed)
    d.setDate(d.getDate() + offset)
    return d.toISOString().slice(0, 10)
  }
  return { from: day(3), to: day(5) }
}

function toLines(order: Order): ConfirmationLine[] {
  return order.lines.map((l: OrderLine) => ({
    sku: l.sku,
    name: l.variantTitle ? `${l.title} – ${l.variantTitle}` : l.title,
    qty: l.quantity,
    unitAmount: round(l.unitPrice),
    // A quiz-built stack is a bundle; a shop basket is not.
    isBundleComponent: order.channel === 'quiz' || order.channel === 'subscription',
  }))
}

/**
 * Present the order exactly as it stands NOW, from the stored snapshot rather
 * than the live catalogue — a product discontinued or re-priced since purchase
 * must not rewrite what someone was charged (OC-E-010, OC-NFR-014).
 */
export function toConfirmationOrder(order: Order): ConfirmationOrder {
  return {
    reference: orderReference(order),
    placedAt: order.createdAt,
    emailMasked: maskEmail(order.email),
    currency: order.currency,
    totals: {
      subtotal: round(order.subtotal),
      discount: 0,
      shipping: round(order.shipping),
      tax: 0,
      total: round(order.total),
    },
    lineItems: toLines(order),
    shippingAddress: order.shippingAddress,
    deliveryEstimate: deliveryEstimate(order.createdAt),
    refunded: order.status === 'refunded' ? true : undefined,
    status: order.status,
  }
}

function cadenceLabel(months: number): string {
  return months <= 1 ? 'Every month' : `Every ${months} months`
}

/**
 * A member-facing reference for a plan.
 *
 * Derived from the Stripe subscription id rather than minted, so the same plan
 * always prints the same reference however many times the page is loaded — a
 * receipt whose number changes on refresh is not a receipt. Falls back to the
 * account id for the window before Stripe's id has landed.
 */
export function subscriptionReference(sub: MemberSubscription, userId: string): string {
  const source = sub.stripeSubscriptionId ?? userId
  return `SUB-${source.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase()}`
}

/** The member's plan, as the confirmation screen needs it (OC-F-040, OC-F-044). */
export function toConfirmationSubscription(
  sub: MemberSubscription,
  opts: {
    manageUrl?: string | null
    /** The account the plan belongs to, for the reference fallback. */
    userId?: string
    /** What Stripe charged today, in minor units. */
    firstPayment?: number | null
    /** Stripe's collected email, when the plan has none of its own yet. */
    email?: string | null
    currency?: string
  } = {},
): ConfirmationSubscription {
  // Group lines by shipping rhythm so a plan with mixed cadences lists each one
  // separately rather than averaging them into a single misleading line.
  const groups = new Map<number, string[]>()
  for (const line of sub.lines) {
    const months = Math.max(1, line.deliveryIntervalMonths)
    groups.set(months, [...(groups.get(months) ?? []), line.productTitle])
  }

  const next = nextBillingDate(sub)
  return {
    cadenceLabel: 'Every month',
    recurringAmount: round(sub.flatMonthly),
    nextBillingDate: next,
    // Billing and dispatch are the same day here — stated rather than assumed,
    // because OC-F-040 requires both to be shown and labelled distinctly.
    nextDispatchDate: sub.nextDispatchOverride ?? next,
    trial: null,
    manageUrl: opts.manageUrl ?? null,
    cadenceGroups: [...groups.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([months, items]) => ({ label: cadenceLabel(months), items })),

    reference: subscriptionReference(sub, opts.userId ?? sub.id),
    startedAt: sub.startedAt,
    emailMasked: maskEmail(sub.customerEmail || opts.email),
    currency: (opts.currency ?? 'GBP').toUpperCase(),
    firstPayment: opts.firstPayment ?? null,
    shippingAddress: sub.shippingAddress ?? null,
    lines: sub.lines.map((line) => ({
      name: line.productTitle,
      qty: line.quantity,
      cadenceMonths: Math.max(1, line.deliveryIntervalMonths),
    })),
    minMonths: sub.minMonths,
  }
}

function nextBillingDate(sub: MemberSubscription): string | null {
  if (sub.nextDispatchOverride) return sub.nextDispatchOverride.slice(0, 10)
  const day = Math.min(Math.max(sub.dispatchDayOfMonth, 1), 28)
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), day)
  if (next <= now) next.setMonth(next.getMonth() + 1)
  return next.toISOString().slice(0, 10)
}

// ─── Variant resolution (§2.1) ───────────────────────────────────────────────

/**
 * Which confirmation to show, derived from what the order and subscription
 * ACTUALLY are.
 *
 * Any `journey_variant` hint in Stripe metadata is exactly that — a hint. It
 * arrives from a session we created, but treating it as authoritative would let
 * a tampered or stale value pick the copy (OC-D-004). This never reads it.
 */
export function resolveVariant(input: {
  isSubscription: boolean
  hasPersonalisation: boolean
  hasBundleLines: boolean
  hasStandardLines: boolean
}): ConfirmationVariant {
  if (input.isSubscription) {
    return input.hasPersonalisation ? 'personalised_subscription' : 'standard_subscription'
  }
  if (input.hasPersonalisation && input.hasBundleLines) {
    return input.hasStandardLines ? 'mixed' : 'personalised_bundle'
  }
  return 'standard'
}

/** Stripe's payment status → the state the screen may render (OC-F-012). */
export function stateForSession(session: {
  payment_status?: string | null
  status?: string | null
}): ConfirmationState {
  if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
    return 'confirmed'
  }
  // Unpaid: still open means the payment is in flight (async methods), expired
  // means it never happened. Never show recovery for a payment still clearing —
  // that would tell someone their order failed while their money is on its way
  // (OC-E-005).
  return session.status === 'expired' ? 'recovery' : 'processing'
}

// ─── Building the response ───────────────────────────────────────────────────

export interface ResolveInput {
  /** From `?session_id=` — a Stripe Checkout Session id. */
  sessionId?: string | null
  /** Mock mode only: the order we created directly, with no Stripe involved. */
  mockOrderId?: string | null
  /** Absolute origin, for building manage/plan links. */
  origin: string
}

/**
 * Resolve a confirmation request into exactly what the screen may render.
 *
 * Returns RECOVERY for anything it cannot positively verify — an unknown
 * session, a missing order, a Stripe error. There is deliberately no branch that
 * renders success on the strength of the URL alone.
 */
export async function resolveConfirmation(input: ResolveInput): Promise<ConfirmationResponse> {
  // ── Mock mode: no Stripe session exists, so the order id IS the evidence ──
  if (getPaymentSource() !== 'stripe') {
    if (!input.mockOrderId) return RECOVERY
    const order = await getOrder(input.mockOrderId)
    if (!order) return RECOVERY
    return buildFromOrder(order, input.origin)
  }

  /**
   * An order that cost nothing, in Stripe mode.
   *
   * Two instruments reach £0.00: a founder `free` code and a partner's starter
   * stack. Either way there is no Checkout Session behind the order — there was
   * nothing for Stripe to take — so it arrives here with `?order=` and no
   * `session_id`, exactly like a mock one. It is admitted on the ORDER's own
   * evidence, not on the URL's: it must carry one of those two codes, be paid,
   * and have never touched Stripe. All three, so this cannot become a way to
   * read an ordinary order by id.
   *
   * The id itself is 18 random hex characters, which is what stops it being an
   * enumeration route (OC-E-007) — the same protection the mock branch above
   * relies on.
   */
  if (!input.sessionId && input.mockOrderId) {
    const order = await getOrder(input.mockOrderId)
    if (!order) return RECOVERY
    const paidNothing = order.founderCode || order.starterCode
    if (!paidNothing || order.status !== 'paid' || order.stripeSessionId) return RECOVERY
    return buildFromOrder(order, input.origin)
  }

  if (!input.sessionId) return RECOVERY

  let session: Stripe.Checkout.Session
  try {
    const { getStripeClient } = await import('@/lib/payments/stripe')
    session = await getStripeClient().checkout.sessions.retrieve(input.sessionId)
  } catch {
    // Unknown, tampered or belonging to another account. Indistinguishable on
    // purpose — no enumeration signal (OC-E-007).
    return RECOVERY
  }

  const state = stateForSession(session)
  if (state === 'recovery') return RECOVERY

  const reference = session.client_reference_id ?? null
  if (!reference) return RECOVERY

  if (session.mode === 'subscription') {
    return buildFromSubscription(reference, state, input.origin, session)
  }

  const order = await getOrder(reference)
  if (!order) {
    // Paid, but the webhook that raises the order hasn't landed yet. Processing,
    // never recovery — the money is real (OC-E-005).
    return { ...RECOVERY, state: 'processing' }
  }
  return buildFromOrder(order, input.origin, state)
}

async function buildFromOrder(
  order: Order,
  origin: string,
  state: ConfirmationState = 'confirmed',
): Promise<ConfirmationResponse> {
  const hasBundleLines = order.channel === 'quiz'
  const variant = resolveVariant({
    isSubscription: false,
    hasPersonalisation: hasBundleLines,
    hasBundleLines,
    hasStandardLines: !hasBundleLines,
  })

  return {
    state,
    variant,
    order: toConfirmationOrder(order),
    subscription: null,
    // Personalisation is resolved separately and may legitimately be absent —
    // the screen renders the standard variant when it is (OC-F-001, OC-D-005).
    personalisation: null,
    analytics: {
      transactionId: orderReference(order),
      alreadyReported: order.analyticsReported === true,
      journeyVariant: variant,
    },
  }
}

async function buildFromSubscription(
  userId: string,
  state: ConfirmationState,
  origin: string,
  session?: Pick<Stripe.Checkout.Session, 'amount_total' | 'currency' | 'customer_details'>,
): Promise<ConfirmationResponse> {
  const sub = await getSubscription(userId)
  if (!sub) return { ...RECOVERY, state: 'processing' }

  const variant = resolveVariant({
    isSubscription: true,
    hasPersonalisation: false,
    hasBundleLines: true,
    hasStandardLines: false,
  })

  return {
    state,
    variant,
    order: null,
    subscription: toConfirmationSubscription(sub, {
      manageUrl: `${origin}/myhub`,
      userId,
      // Stripe's own figure for what came off the card today — the intro coupon
      // and the postage line included. Not the plan's monthly, which is a
      // different number in month one and would print as a charge that never
      // happened.
      firstPayment: session?.amount_total ?? null,
      email: session?.customer_details?.email ?? null,
      currency: session?.currency ?? undefined,
    }),
    personalisation: null,
    analytics: {
      transactionId: sub.stripeSubscriptionId ?? userId,
      alreadyReported: false,
      journeyVariant: variant,
    },
  }
}
