/**
 * The Founders Hub dashboard — one honest view of the business.
 *
 * Pure aggregation: the route does every read and hands the pieces in, so the
 * numbers can be tested exactly and nothing here can accidentally hit a supplier
 * or a database.
 *
 * The money deliberately reconciles rather than flatters:
 *   • revenue counts orders that were actually paid for and not given back,
 *   • cost counts the goods AND the postage we carry, not just the goods,
 *   • anything we don't know the cost of is reported as unknown rather than
 *     silently treated as free, because a margin computed over half a catalogue
 *     is worse than no margin at all.
 */
import type { Order } from '@/lib/orders/types'
import type { SubscriptionSummary } from '@/lib/changes/health'
import { blendedDeliveryCost } from '@/lib/pricing/delivery'
import { revenueFromShelfPrice, costFromSupplierPrice } from '@/lib/pricing/vat'
import type { PricingConfig } from '@/lib/stack-blueprint/pricing'

const round = (n: number) => Math.round(n * 100) / 100
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 1000 : 0)

/** Statuses that mean the customer paid and kept the order. */
const EARNED = new Set(['paid', 'submitted_to_supplier', 'supplier_confirmed', 'shipped', 'delivered'])
const GAVE_BACK = new Set(['refunded', 'cancelled'])

export interface MoneyWindow {
  /** ISO date the window starts (inclusive). */
  from: string
  orders: number
  /** What customers paid, VAT included (£). The till total. */
  revenue: number
  /** What we keep after VAT (£) — the only honest base for a margin. */
  netRevenue: number
  /** VAT collected on behalf of HMRC (£). Never ours. */
  vat: number
  /** What the goods cost us, where every line's cost is known. */
  cogs: number
  /** What we expect to pay the supplier to deliver these orders. */
  delivery: number
  /** Card fees on taking the money (£). */
  paymentFees: number
  /** netRevenue − cogs − delivery − fees. */
  grossProfit: number
  /** grossProfit ÷ netRevenue (0–1). */
  marginPct: number
  /** Average order value. */
  aov: number
  /** Orders whose cost we don't fully know — the margin above excludes them. */
  ordersWithUnknownCost: number
  refunded: number
  refundedValue: number
}

export interface DashboardSummary {
  /** Rolling windows, newest first: today, 7 days, this calendar month. */
  today: MoneyWindow
  last7: MoneyWindow
  month: MoneyWindow
  orders: {
    /** Orders raised in the last 24h. */
    today: number
    /** Paid but not yet reviewed for the supplier. */
    awaitingReview: number
    /** Reviewed and approved, not yet sent. */
    readyToSend: number
    /** Sent to the supplier, not yet delivered. */
    inFlight: number
    /** Submit attempts that errored. */
    failed: number
  }
  subscriptions: {
    active: number
    /** Recurring revenue per month (£). */
    mrr: number
    requiresAction: number
    /** Average monthly value per member (£). */
    arpu: number
  }
  /** Everything asking for a founder's attention, biggest first. */
  actionRequired: { label: string; count: number; href: string }[]
  /**
   * Things that need a decision but have no count — a VAT threshold coming up
   * isn't "3 of something", it's one fact with a date on it. Kept separate so
   * the counted list stays sortable by urgency.
   */
  notices: { id: string; label: string; detail: string; href: string; tone: 'watch' | 'act' }[]
}

function orderCost(order: Order, config: PricingConfig): { cogs: number; delivery: number; known: boolean } {
  const known = order.lines.length > 0 && order.lines.every((l) => l.supplierCost != null)
  // Supplier prices are ex VAT; what they actually cost depends on whether we
  // can reclaim (see lib/pricing/vat.ts).
  const cogs = costFromSupplierPrice(
    order.lines.reduce((s, l) => s + (l.supplierCost ?? 0) * l.quantity, 0),
    config,
  )
  // PowerBody band delivery on the WHOLESALE VALUE of the order — what we pay
  // them — so that is what sets the cost, and a big enough order ships free.
  // Note this is their ex-VAT price, not `cogs` above, which may have had
  // irrecoverable VAT added to it.
  const wholesale = order.lines.reduce((s, l) => s + (l.supplierCost ?? 0) * l.quantity, 0)
  // What the supplier charges us to ship it, less whatever the member paid for
  // postage net of VAT — their contribution is already inside `order.total`.
  const collected = revenueFromShelfPrice(order.shipping, config.vat.standardRate, config)
  return {
    cogs: round(cogs),
    delivery: round(Math.max(0, blendedDeliveryCost(wholesale, config) - collected)),
    known,
  }
}

/** Money over one window of orders. */
export function moneyWindow(from: string, orders: Order[], config: PricingConfig): MoneyWindow {
  const inWindow = orders.filter((o) => o.createdAt >= from)
  const earned = inWindow.filter((o) => EARNED.has(o.status))
  const given = inWindow.filter((o) => GAVE_BACK.has(o.status))

  let cogs = 0
  let delivery = 0
  let fees = 0
  let unknown = 0
  let costedNetRevenue = 0
  for (const o of earned) {
    const c = orderCost(o, config)
    if (!c.known) {
      unknown += 1
      continue
    }
    cogs += c.cogs
    delivery += c.delivery
    fees += o.total * config.paymentFees.percent + config.paymentFees.fixed
    costedNetRevenue += revenueFromShelfPrice(o.total, config.vat.standardRate, config)
  }

  const revenue = round(earned.reduce((s, o) => s + o.total, 0))
  // VAT is collected, not earned. Counting it as revenue and then taking costs
  // off overstates the margin by the whole VAT rate.
  const netRevenue = round(revenueFromShelfPrice(revenue, config.vat.standardRate, config))
  const grossProfit = round(costedNetRevenue - cogs - delivery - fees)

  return {
    from,
    orders: earned.length,
    revenue,
    netRevenue,
    vat: round(revenue - netRevenue),
    cogs: round(cogs),
    delivery: round(delivery),
    paymentFees: round(fees),
    grossProfit,
    // Margin is measured against the NET revenue we could actually cost, so
    // neither VAT nor an uncosted order can quietly inflate it.
    marginPct: pct(grossProfit, round(costedNetRevenue)),
    aov: earned.length > 0 ? round(revenue / earned.length) : 0,
    ordersWithUnknownCost: unknown,
    refunded: given.length,
    refundedValue: round(given.reduce((s, o) => s + o.total, 0)),
  }
}

export interface DashboardInput {
  orders: Order[]
  subscriptions: SubscriptionSummary[]
  config: PricingConfig
  /** Orders waiting on the daily supplier review. */
  awaitingReview: number
  readyToSend: number
  /** Open product-change events (out of stock, price moves). */
  openChanges: number
  /** Products failing a launch-readiness check. */
  productsNeedingAttention: number
  /** Where we stand on VAT registration, when it's worth saying anything. */
  vat?: { tone: 'ok' | 'watch' | 'act'; headline: string; detail: string } | null
  /** Paid orders going somewhere PowerBody will not ship. */
  undeliverable?: number
  now?: Date
}

export function buildDashboard(input: DashboardInput): DashboardSummary {
  const now = input.now ?? new Date()
  const iso = (d: Date) => d.toISOString()
  const dayAgo = iso(new Date(now.getTime() - 86_400_000))
  const weekAgo = iso(new Date(now.getTime() - 7 * 86_400_000))
  const monthStart = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)))

  const { orders, subscriptions, config } = input
  const mrr = round(subscriptions.reduce((s, x) => s + x.flatMonthly, 0))
  const requiresAction = subscriptions.filter((s) => s.health === 'requires-action').length

  const actionRequired = [
    { label: 'Orders PowerBody will not ship to', count: input.undeliverable ?? 0, href: '/founderhub/commerce/queue' },
    { label: 'Orders to review before we ask the supplier', count: input.awaitingReview, href: '/founderhub/commerce/queue' },
    { label: 'Approved orders ready to send', count: input.readyToSend, href: '/founderhub/commerce/queue' },
    { label: 'Product changes on live subscriptions', count: input.openChanges, href: '/founderhub/actions' },
    { label: 'Subscriptions needing attention', count: requiresAction, href: '/founderhub/commerce/subscriptions' },
    { label: 'Products not launch-ready', count: input.productsNeedingAttention, href: '/founderhub/products/readiness' },
    { label: 'Orders that failed to reach the supplier', count: orders.filter((o) => o.status === 'failed').length, href: '/founderhub/commerce/orders' },
  ]
    .filter((a) => a.count > 0)
    .sort((a, b) => b.count - a.count)

  return {
    today: moneyWindow(dayAgo, orders, config),
    last7: moneyWindow(weekAgo, orders, config),
    month: moneyWindow(monthStart, orders, config),
    orders: {
      today: orders.filter((o) => o.createdAt >= dayAgo).length,
      awaitingReview: input.awaitingReview,
      readyToSend: input.readyToSend,
      inFlight: orders.filter((o) => ['submitted_to_supplier', 'supplier_confirmed', 'shipped'].includes(o.status)).length,
      failed: orders.filter((o) => o.status === 'failed').length,
    },
    subscriptions: {
      active: subscriptions.length,
      mrr,
      requiresAction,
      arpu: subscriptions.length > 0 ? round(mrr / subscriptions.length) : 0,
    },
    actionRequired,
    // Only surfaced once it's actionable — a threshold six years away is noise.
    notices:
      input.vat && input.vat.tone !== 'ok'
        ? [{ id: 'vat', label: input.vat.headline, detail: input.vat.detail, href: '/founderhub/pricing', tone: input.vat.tone }]
        : [],
  }
}
