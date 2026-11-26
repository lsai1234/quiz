/**
 * Re-deriving the money on a subscription the browser has just sent back.
 *
 * `PUT /api/hub/subscription` takes a whole `MemberSubscription` from the
 * client. That is a deliberate design — the mutation helpers in `./mock` are
 * pure functions the hub runs locally, so the document arrives whole and the
 * server works out what changed — and it is fine for everything except money.
 *
 * It was not fine for money. Every figure that decides what a member pays
 * arrived from their own browser and was saved, then pushed to Stripe:
 *
 * | Field | What a hand-written PUT could do |
 * |---|---|
 * | `flatMonthly` | keep all five products and pay £1.23 a month |
 * | `lines[].pricePerDelivery` | set the price of each product to 50p |
 * | `subscriptionDiscountRate` | award themselves 95% subscribe-&-save |
 * | `lines[].deliveryIntervalMonths` | stretch cadence to 60 months, collapsing the monthly spread |
 * | `lines[].pendingCredit` | credit their own Stripe customer balance by any amount |
 * | `lines[].deliveriesMade` | erase what has shipped, and with it the exit settlement |
 *
 * `/api/cart` has said the right thing about this from the beginning — *"prices
 * every line server-side from the catalogue; the client's numbers are never
 * trusted"*. This is that rule, for the other door into someone's billing.
 *
 * ── Why it is not simply "re-price everything from the catalogue" ──
 *
 * Because a member's price is deliberately **not** always today's price. When a
 * supplier substitution costs more, `changes/apply.ts` holds them at the old
 * figure and absorbs the difference; that grandfathering is the whole point of
 * the change-notice machinery, and re-pricing from the catalogue on every save
 * would quietly undo it — turning a security fix into a silent price rise.
 *
 * So the rule is narrower and stronger: **the client may not change the money at
 * all.** A line that was already on the plan keeps its stored unit price, so
 * grandfathering survives. A line that is new, or that has been swapped to a
 * different product, is priced from the catalogue — the same call `addLine` and
 * `swapSubscriptionLine` make. Everything else is recomputed from those.
 *
 * Server-only in effect, though the function is pure and unit-tested directly.
 */
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { getPricingConfig, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import { discountedUnitFor, flatMonthlyOf, MAX_LINE_UNITS } from './mock'
import { nextBoxCycle, shipsAtCycle, withInterval } from './clock'
import { cycleForMonth } from './schedule'
import type { DeliveryOverride, MemberSubscription, MemberSubscriptionLine } from './types'

const round = (n: number) => Math.round(n * 100) / 100

export type RepriceResult =
  | { ok: true; subscription: MemberSubscription }
  /** The change is refused outright; nothing should be saved or sent to Stripe. */
  | { ok: false; reason: string }

/** The billing cycle a box id (`YYYY-MM`) belongs to, or null for one it can't read. */
function cycleOfBox(sub: MemberSubscription, id: string, now: Date): number | null {
  const [year, month] = id.split('-').map(Number)
  if (!year || !month) return null
  return cycleForMonth(sub, year, month - 1, now)
}

/**
 * The credit a skip of this line has just earned, and only that: the line's
 * value for every box still to come that it was due in, that this request takes
 * it out of, and that isn't skipped already (a skipped box is credited whole).
 *
 * Skipping one product takes it out of its next box (`skipNextDelivery`), the
 * same as pulling it out from the box's own sheet, and dispatch leaves out what
 * a box has removed. So the credit is worked out from the boxes, here, from the
 * stored plan: a hand-written credit, or one for a box that has already gone or
 * that the product wasn't in, can't reach `creditCustomerBalance`.
 *
 * It used to be read off the line's `nextShipAt` moving later, which nothing
 * shipped by: the member was credited and the product came anyway.
 */
function skipAllowance(
  previous: MemberSubscription,
  incoming: MemberSubscription,
  before: MemberSubscriptionLine,
  now: Date,
): number {
  const next = nextBoxCycle(previous, now)
  let allowance = 0
  for (const [id, override] of Object.entries(incoming.deliveryOverrides ?? {})) {
    if (!override?.removedLineIds?.includes(before.id)) continue
    const stored = previous.deliveryOverrides?.[id]
    if (stored?.removedLineIds?.includes(before.id)) continue
    if (stored?.skipped || override.skipped) continue
    const cycle = cycleOfBox(previous, id, now)
    if (cycle == null || cycle < next || !shipsAtCycle(before, cycle)) continue
    allowance = round(allowance + before.pricePerDelivery)
  }
  return allowance
}

/**
 * A product taken out of a box still to come stays out once it's been
 * credited: putting it back would ship it and keep the credit. (The hub has no
 * control for it; this holds for anything else that sends the document.)
 */
function keepRemovals(
  previous: MemberSubscription,
  incoming: MemberSubscription['deliveryOverrides'],
  now: Date,
): MemberSubscription['deliveryOverrides'] {
  const next = nextBoxCycle(previous, now)
  const out: Record<string, DeliveryOverride> = { ...(incoming ?? {}) }
  for (const [id, stored] of Object.entries(previous.deliveryOverrides ?? {})) {
    const removed = stored?.removedLineIds ?? []
    if (removed.length === 0) continue
    const cycle = cycleOfBox(previous, id, now)
    if (cycle == null || cycle < next) continue
    const sent = out[id]?.removedLineIds ?? []
    out[id] = { ...(out[id] ?? {}), removedLineIds: [...new Set([...sent, ...removed])] }
  }
  return out
}

/**
 * Rebuild every money field on an incoming subscription from what the server
 * already knows, and refuse the change if it cannot be priced.
 */
export function normaliseIncomingSubscription(
  previous: MemberSubscription,
  incoming: MemberSubscription,
  catalogue: CatalogueProduct[],
  config: PricingConfig = getPricingConfig(),
  now: Date = new Date(),
): RepriceResult {
  /* The subscribe-&-save rate is set once, from the bundle tier the member
     signed up on. It is not theirs to edit. */
  const rate = previous.subscriptionDiscountRate
  /* The next box still to come: where a new product's first box is, and where a
     change of how often counts from. */
  const nextCycle = nextBoxCycle(previous, now)

  const byId = new Map(previous.lines.map((l) => [l.id, l]))
  const lines: MemberSubscriptionLine[] = []

  for (const line of incoming.lines) {
    const before = byId.get(line.id)

    // Bounds the hub's own controls already apply — re-applied here because the
    // hub is not the only thing that can send this document.
    const quantity = Math.min(MAX_LINE_UNITS, Math.max(1, Math.round(Number(line.quantity) || 1)))
    const cadence = Math.min(
      config.maxDeliveryMonths,
      Math.max(1, Math.round(Number(line.deliveryIntervalMonths) || 1)),
    )

    /* A line already on the plan keeps its own unit price, whatever the
       catalogue says today — that is what protects a grandfathered price. A new
       or swapped line is priced the way `addLine` would price it. */
    let unit: number
    const carriedOver = before && before.productId === line.productId
    if (carriedOver) {
      unit = before.pricePerDelivery / Math.max(1, before.quantity)
    } else {
      const product = catalogue.find((p) => p.id === line.productId)
      if (!product) {
        return { ok: false, reason: `We don’t recognise one of the products on this plan.` }
      }
      unit = discountedUnitFor(product, config, rate).discountedUnit
    }

    const pricePerDelivery = round(quantity * unit)

    /* A skip banks the value of the delivery it skipped — no more, and only for
       a box it really takes the product out of (`skipAllowance`). Anything else
       keeps the stored figure, so a hand-written credit cannot reach
       `creditCustomerBalance`. */
    const creditBefore = before?.pendingCredit ?? 0
    const creditCeiling = before ? round(creditBefore + skipAllowance(previous, incoming, before, now)) : 0
    const pendingCredit = Math.min(Math.max(0, Number(line.pendingCredit) || 0), creditCeiling)

    /* When it ships is the server's too. A line already on the plan keeps its
       first box and its count; a changed cadence counts from its last delivery
       (`withInterval`), worked out here from the stored line rather than taken
       from the browser, which could otherwise time a quarterly tub into every
       box. A new line's first box is the next one still to come.

       `joinedAtMonth` used to fall back to the current month for any line that
       didn't carry one, which is every line made at checkout: the first save of
       anything at all (a skip, the out-of-stock choice) moved every product's
       months, so a tub due in month 3 came in month 5 instead. */
    const timing = before
      ? withInterval(
          { deliveryIntervalMonths: before.deliveryIntervalMonths, joinedAtMonth: before.joinedAtMonth, cadenceFrom: before.cadenceFrom },
          cadence,
          nextCycle,
        )
      : { deliveryIntervalMonths: cadence, joinedAtMonth: nextCycle, cadenceFrom: undefined }

    lines.push({
      ...line,
      quantity,
      deliveryIntervalMonths: cadence,
      pricePerDelivery,
      pendingCredit,
      /* Re-derived from the subscription clock on every paid cycle, and the
         basis of the exit settlement — never the client's to lower. */
      deliveriesMade: before?.deliveriesMade ?? 0,
      joinedAtMonth: timing.joinedAtMonth,
      cadenceFrom: timing.cadenceFrom,
      // Words only: a line keeps its own, and a new or swapped one brings the hub's sizing.
      lastsMonths: carriedOver ? before.lastsMonths : typeof line.lastsMonths === 'number' && line.lastsMonths > 0 ? line.lastsMonths : undefined,
    })
  }

  /**
   * The monthly total, but only re-summed when the plan behind it moved.
   *
   * `flatMonthlyOf` amortises each line's per-delivery price over its cadence;
   * the figure stored at signup comes from the pricing engine's own
   * `subscriptionTotal`. On the sample plan those disagree by a penny —
   * 53.25 against 53.24 — because they round in different places. Every existing
   * mutation (`addLine`, `removeLine`, `swapSubscriptionLine`, `setLineQuantity`)
   * already re-sums with `flatMonthlyOf`, so a member's first real change moves
   * them onto that figure regardless. What should NOT happen is a save that
   * changed nothing about the plan — accepting the new terms, moving the
   * dispatch day — quietly shaving a penny and pushing a fresh amount at Stripe.
   *
   * So: identical lines keep the stored total; anything else is re-summed.
   */
  const sameLines =
    lines.length === previous.lines.length &&
    lines.every((line, i) => {
      const before = previous.lines[i]
      return (
        before?.id === line.id &&
        before.productId === line.productId &&
        before.quantity === line.quantity &&
        before.deliveryIntervalMonths === line.deliveryIntervalMonths &&
        Math.abs(before.pricePerDelivery - line.pricePerDelivery) < 0.005
      )
    })

  return {
    ok: true,
    subscription: {
      ...incoming,
      lines,
      deliveryOverrides: keepRemovals(previous, incoming.deliveryOverrides, now),
      subscriptionDiscountRate: rate,
      flatMonthly: sameLines ? previous.flatMonthly : flatMonthlyOf(lines),
    },
  }
}
