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
import { discountedUnitFor, flatMonthlyOf, MAX_LINE_UNITS, nextDispatchDate } from './mock'
import type { MemberSubscription, MemberSubscriptionLine } from './types'

const round = (n: number) => Math.round(n * 100) / 100

export type RepriceResult =
  | { ok: true; subscription: MemberSubscription }
  /** The change is refused outright; nothing should be saved or sent to Stripe. */
  | { ok: false; reason: string }

/**
 * Did this line's next delivery move later? That, and only that, is a skip —
 * and a skip is the one thing allowed to add to `pendingCredit`.
 *
 * A line does not always carry its own `nextShipAt`: lines created at signup
 * take the box's date from `dispatchDayOfMonth`, and only a line that has been
 * moved individually stores one. `skipNextDelivery` uses that same fallback, so
 * this has to as well — without it, the first skip of an untouched line looks
 * like no movement at all and the member is silently refused their credit.
 */
function movedLater(
  sub: MemberSubscription,
  previous: MemberSubscriptionLine | undefined,
  incoming: MemberSubscriptionLine,
): boolean {
  if (!incoming.nextShipAt) return false
  const fallback = nextDispatchDate(sub.dispatchDayOfMonth).getTime()
  const was = previous?.nextShipAt ? new Date(previous.nextShipAt).getTime() : fallback
  return new Date(incoming.nextShipAt).getTime() > was
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
): RepriceResult {
  /* The subscribe-&-save rate is set once, from the bundle tier the member
     signed up on. It is not theirs to edit. */
  const rate = previous.subscriptionDiscountRate

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

    /* A skip banks the value of the delivery it skipped — no more, and only when
       the delivery actually moved. Anything else keeps the stored figure, so a
       hand-written credit cannot reach `creditCustomerBalance`. */
    const creditBefore = before?.pendingCredit ?? 0
    const creditCeiling = movedLater(previous, before, line) ? round(creditBefore + pricePerDelivery) : creditBefore
    const pendingCredit = Math.min(Math.max(0, Number(line.pendingCredit) || 0), creditCeiling)

    lines.push({
      ...line,
      quantity,
      deliveryIntervalMonths: cadence,
      pricePerDelivery,
      pendingCredit,
      /* Re-derived from the subscription clock on every paid cycle, and the
         basis of the exit settlement — never the client's to lower. */
      deliveriesMade: before?.deliveriesMade ?? 0,
      joinedAtMonth: before?.joinedAtMonth ?? previous.monthsActive,
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
      subscriptionDiscountRate: rate,
      flatMonthly: sameLines ? previous.flatMonthly : flatMonthlyOf(lines),
    },
  }
}
