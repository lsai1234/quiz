/**
 * Delivery economics — PowerBody's rate card.
 *
 * BANDED ON ORDER VALUE, NOT WEIGHT
 * ─────────────────────────────────
 * Their site prices delivery on what WE pay for the order:
 *
 *     up to £50 wholesale  → £6.50
 *     up to £99 wholesale  → £5.50
 *     over £99 wholesale   → free
 *
 * That shape drives the whole catalogue strategy, and in the opposite direction
 * to a weight-banded card. Under a weight card you want light parcels; here you
 * want BIG ones, because the third band is free. A member taking three products
 * quarterly can clear £99 of wholesale in one shipment and cost us nothing to
 * deliver, while the same member buying one product monthly pays us £6.50 of
 * delivery twelve times a year.
 *
 * Note the earlier Dropshipping Guide quoted weight bands instead (Royal Mail
 * £3.25, DPD £5.17) and said free delivery was unavailable to dropshippers.
 * These rates supersede that — they are what the account actually shows — but
 * the difference is worth confirming with PowerBody, because the small-order
 * cost doubled and the large-order cost went to zero.
 *
 * Two numbers hide behind the word "delivery" and confusing them is how a
 * catalogue goes quietly unprofitable: what the SUPPLIER charges US (the bands
 * above, on our wholesale spend) and what WE charge the MEMBER
 * (`delivery.customerRates`, on their retail total). They are deliberately cut
 * to line up — we stop charging at £100 of retail, which is where their £50
 * wholesale band ends and their price steps down — but they are never the same
 * number, and the gap between them is a real cost the sell price has to carry.
 *
 * The one place they do not line up is Zone 2, where their free band needs £300
 * of wholesale and effectively never arrives, so `zone2Surcharge` applies to
 * every rung including the free one.
 *
 * All supplier prices here are EX VAT, as PowerBody quote them; what that
 * actually costs us depends on whether we can reclaim it (see `./vat.ts`).
 *
 * Pure functions — the hub can preview a rate-card change before saving it.
 */
import {
  getPricingConfig,
  type PricingConfig,
  type CustomerDeliveryRate,
  type DeliveryZone,
  type DeliveryService,
} from '@/lib/stack-blueprint/pricing'
import { costFromSupplierPrice, revenueFromShelfPrice } from './vat'
import { zoneForPostcode } from './zones'

const round = (n: number) => Math.round(n * 100) / 100

export type { DeliveryZone, DeliveryService }

export const ZONE_LABELS: Record<DeliveryZone, string> = {
  'uk-1': 'UK mainland',
  'uk-2': 'Highlands & Islands',
  eu: 'EU',
}

/** One shipment, as the supplier would price it. */
export interface Shipment {
  /**
   * What WE pay PowerBody for the goods in this shipment (£ ex VAT). This — not
   * the weight, and not what the member pays us — is what their rate card bands
   * on, and it is why a bigger basket eventually ships free.
   */
  supplierValue: number
  /** Shipped weight (g). Not used for pricing; PowerBody's createOrder needs it. */
  grams?: number
  /** Where it's going. Defaults to the configured pricing zone. */
  zone?: DeliveryZone
  /**
   * The delivery postcode, when we have one. Beats `zone` — for a real order
   * there is no need to assume a zone, and PowerBody publish the postcode list.
   */
  postcode?: string | null
  /**
   * What the member is being charged for the goods (£ inc VAT at OUR retail
   * prices), which decides whether they qualify for OUR free-delivery offer.
   * Not comparable to any PowerBody threshold — see `freeDeliveryThreshold`.
   */
  orderValue?: number
}

export interface DeliveryQuote {
  /** The service the supplier would use, or null when nothing can carry it. */
  service: DeliveryService | null
  zone: DeliveryZone
  /** The wholesale value the band was chosen on (£). */
  supplierValue: number
  /** What the supplier charges us, ex VAT (£). */
  supplierPriceExVat: number
  /** What that actually costs us once VAT recovery is accounted for (£). */
  supplierCost: number
  /** What the member is charged, inc VAT (£). */
  customerCharge: number
  /** What we carry ourselves (£). Never negative — collecting more than it cost
   *  is margin, not a negative cost. */
  absorbed: number
  freeForCustomer: boolean
  /**
   * Set when no service on the rate card can carry this weight to this zone —
   * e.g. over 7kg to the Highlands, which PowerBody simply don't list. The
   * order can't be fulfilled as it stands, and pretending it costs £0 would
   * hide that.
   */
  unavailableReason: string | null
}

/**
 * The bands for a zone in the order the rate card reads them: tightest ceiling
 * first, with the open-ended band last.
 *
 * The ordering is the whole rule. "Up to £50 → £6.50, up to £99 → £5.50, above
 * → free" is a FIRST-FIT ladder, not a cheapest-qualifying one: a £30 order
 * fits under £50 and stops there. Picking the cheapest band an order qualifies
 * for — the rule the discount tiers use — would hand everything the free band,
 * because "no ceiling" qualifies everything.
 */
export function eligibleServices(
  orderValue: number,
  zone: DeliveryZone,
  config: PricingConfig = getPricingConfig(),
): DeliveryService[] {
  return config.delivery.services
    .filter((s) => s.zone === zone)
    .sort((a, b) => (a.maxOrderValue ?? Infinity) - (b.maxOrderValue ?? Infinity))
    .filter((s) => s.maxOrderValue == null || orderValue <= s.maxOrderValue)
}

/** The band the supplier would charge us under — the first one we fit inside. */
export function selectService(
  orderValue: number,
  zone: DeliveryZone,
  config: PricingConfig = getPricingConfig(),
): DeliveryService | null {
  if (orderValue <= 0) return null
  return eligibleServices(orderValue, zone, config)[0] ?? null
}

/** The next band down, and what reaching it is worth. */
export interface NextBand {
  /** Wholesale value at which the cheaper band starts (£). */
  threshold: number
  /** How much more stock this parcel needs to get there (£ wholesale). */
  shortfall: number
  /** What the supplier charges in that band, ex VAT (£). */
  price: number
  /** What reaching it saves on this parcel, after VAT recovery (£). */
  saving: number
}

/**
 * What we'd have to add to this order, in wholesale terms, to ship free — and,
 * more usefully, to reach the next band down.
 *
 * The free line is the headline but rarely the actionable one: £99 of wholesale
 * is roughly a £190 basket, which almost no order reaches. The step from £6.50
 * to £5.50 at £50 of wholesale IS reachable — often one more product — and that
 * is the number worth putting in front of someone building a bundle.
 */
export function toFreeShipping(
  orderValue: number,
  zone: DeliveryZone = getPricingConfig().delivery.defaultZone,
  config: PricingConfig = getPricingConfig(),
): { threshold: number | null; shortfall: number | null; alreadyFree: boolean; next: NextBand | null } {
  const free = config.delivery.services
    .filter((s) => s.zone === zone && s.price === 0)
    .sort((a, b) => (a.maxOrderValue ?? Infinity) - (b.maxOrderValue ?? Infinity))[0]

  // The bands cheaper than the one this order currently falls in, nearest first.
  const current = selectService(orderValue, zone, config)
  const next: NextBand | null = (() => {
    if (!current) return null
    const cheaper = config.delivery.services
      .filter((s) => s.zone === zone && s.price < current.price && (s.maxOrderValue ?? Infinity) > orderValue)
      .sort((a, b) => (a.maxOrderValue ?? Infinity) - (b.maxOrderValue ?? Infinity))[0]
    if (!cheaper) return null
    // A band with ceiling C starts just above the previous ceiling — which, for
    // the band we are currently in, is our own ceiling.
    const threshold = current.maxOrderValue ?? 0
    return {
      threshold,
      shortfall: round(Math.max(0, threshold - orderValue)),
      price: round(cheaper.price),
      saving: round(costFromSupplierPrice(current.price, config) - costFromSupplierPrice(cheaper.price, config)),
    }
  })()

  if (!free) return { threshold: null, shortfall: null, alreadyFree: false, next }
  // The free band starts where the last paid band ends.
  const paid = config.delivery.services
    .filter((s) => s.zone === zone && s.price > 0 && s.maxOrderValue != null)
    .sort((a, b) => (b.maxOrderValue ?? 0) - (a.maxOrderValue ?? 0))[0]
  const threshold = paid?.maxOrderValue ?? 0
  const alreadyFree = orderValue > threshold
  return { threshold, shortfall: alreadyFree ? null : round(threshold - orderValue), alreadyFree, next }
}

/** The customer ladder, tightest ceiling first — the same first-fit reading as
 *  `eligibleServices`, on retail money instead of wholesale. */
function customerRates(config: PricingConfig): CustomerDeliveryRate[] {
  return [...config.delivery.customerRates].sort(
    (a, b) => (a.maxOrderValue ?? Infinity) - (b.maxOrderValue ?? Infinity),
  )
}

/**
 * The order total at or above which delivery is free — read off the ladder
 * rather than stored beside it.
 *
 * `config.freeDeliveryThreshold` is what the storefront advertises and this is
 * what checkout charges; they have to be the same number, and deriving one from
 * the other is cheaper than trusting two fields to stay in step.
 */
export function deriveFreeDeliveryThreshold(config: PricingConfig = getPricingConfig()): number {
  const rates = customerRates(config)
  const free = rates.find((r) => r.price === 0)
  if (!free) return 0 // every band is paid — no free-delivery offer at all
  const lastPaid = rates.filter((r) => r.price > 0).pop()
  return lastPaid?.maxOrderValue ?? 0
}

/** The entry rung — what the smallest order pays. The margin model solves a
 *  shelf price against this, because a single item is the basket it is pricing. */
export function entryDeliveryCharge(config: PricingConfig = getPricingConfig()): number {
  return round(customerRates(config)[0]?.price ?? 0)
}

/**
 * What the member is charged for delivery on an order of this size, to this zone.
 *
 * The Zone 2 surcharge applies to the free band too. That is not an oversight:
 * PowerBody's Zone 2 free line is £300 of wholesale — roughly a £600 basket —
 * so unlike the mainland, our cost never actually goes away up there.
 */
export function customerDeliveryCharge(
  orderValue: number,
  zone: DeliveryZone = getPricingConfig().delivery.defaultZone,
  config: PricingConfig = getPricingConfig(),
): number {
  if (orderValue <= 0) return 0
  const band = customerRates(config).find((r) => r.maxOrderValue == null || orderValue < r.maxOrderValue)
  const base = band?.price ?? 0
  const surcharge = zone === 'uk-2' ? config.delivery.zone2Surcharge : 0
  return round(base + surcharge)
}

/** One delivery choice as the customer sees it at checkout. */
export interface DeliveryOption {
  /** Stable id, echoed back by Stripe as the chosen shipping rate's name. */
  id: 'uk-mainland' | 'uk-highlands'
  zone: DeliveryZone
  label: string
  /** What they pay for it (£, inc VAT). */
  price: number
}

/**
 * The delivery choices to put in front of someone with a basket this size.
 *
 * Two, and only because of a Stripe constraint worth being explicit about:
 * Checkout fixes its shipping options when the SESSION is created, which is
 * before the customer has typed an address, so a rate cannot react to their
 * postcode the way `quoteDelivery` can. Offering the mainland rate alone would
 * silently undercharge every Highlands order; offering the surcharge to everyone
 * would overcharge the 96%.
 *
 * So the customer self-selects, and `deliverability`/`zoneForPostcode` check the
 * choice against the address they actually gave — the fulfilment queue flags a
 * mainland rate paid on a Highlands postcode rather than trusting the pick. That
 * is the same shape as the rest of the queue: collect, then verify before
 * anything ships.
 */
export function deliveryOptions(orderValue: number, config: PricingConfig = getPricingConfig()): DeliveryOption[] {
  return [
    {
      id: 'uk-mainland',
      zone: 'uk-1',
      label: 'UK mainland',
      price: customerDeliveryCharge(orderValue, 'uk-1', config),
    },
    {
      id: 'uk-highlands',
      zone: 'uk-2',
      label: 'Highlands, Islands & Isle of Man',
      price: customerDeliveryCharge(orderValue, 'uk-2', config),
    },
  ]
}

/** Both sides of one shipment's delivery, and what it leaves us carrying. */
export function quoteDelivery(shipment: Shipment, config: PricingConfig = getPricingConfig()): DeliveryQuote {
  // A known postcode beats an assumed zone every time.
  const fromPostcode = shipment.postcode ? zoneForPostcode(shipment.postcode) : null
  const zone: DeliveryZone = fromPostcode?.zone ?? shipment.zone ?? config.delivery.defaultZone
  const supplierValue = Math.max(0, shipment.supplierValue)

  if (fromPostcode?.excluded) {
    return {
      service: null,
      zone,
      supplierValue,
      supplierPriceExVat: 0,
      supplierCost: 0,
      customerCharge: customerDeliveryCharge(shipment.orderValue ?? 0, zone, config),
      absorbed: 0,
      freeForCustomer: false,
      unavailableReason: fromPostcode.reason,
    }
  }
  const service = selectService(supplierValue, zone, config)

  const supplierPriceExVat = service?.price ?? 0
  const supplierCost = service ? costFromSupplierPrice(supplierPriceExVat, config) : 0
  const customerCharge = customerDeliveryCharge(shipment.orderValue ?? 0, zone, config)

  return {
    service,
    zone,
    supplierValue,
    supplierPriceExVat: round(supplierPriceExVat),
    supplierCost,
    customerCharge,
    absorbed: round(Math.max(0, supplierCost - customerCharge)),
    freeForCustomer: customerCharge === 0,
    // A zero-value shipment is not a free one, it is not a shipment.
    unavailableReason:
      supplierValue <= 0
        ? 'Nothing to ship'
        : service
          ? null
          : `No delivery band covers a £${supplierValue.toFixed(2)} order to ${ZONE_LABELS[zone]}`,
  }
}

/**
 * What we COLLECT for delivery when pricing rather than shipping — the revenue
 * twin of `blendedDeliveryCost`, blended across the same zones.
 *
 * These have to be blended the same way or the model is unfair to itself in one
 * direction: `blendedDeliveryCost` already charges the margin for the Highlands
 * parcels we send, so pricing the revenue at the mainland rate alone would count
 * Zone 2's extra cost while ignoring the surcharge raised to cover it. Small —
 * `zone2SharePct` of one surcharge — but it is the difference between a model
 * that describes the business and one that quietly assumes the worst of it.
 *
 * For an order we are actually shipping, use `customerDeliveryCharge` with the
 * real zone. There is nothing to blend once you know the postcode.
 */
export function blendedCustomerCharge(orderValue: number, config: PricingConfig = getPricingConfig()): number {
  const share = Math.min(1, Math.max(0, config.delivery.zone2SharePct))
  const zone1 = customerDeliveryCharge(orderValue, 'uk-1', config)
  const zone2 = customerDeliveryCharge(orderValue, 'uk-2', config)
  return round(zone1 * (1 - share) + zone2 * share)
}

/**
 * The delivery cost to assume when PRICING rather than shipping — a blend of
 * the zones we actually ship to.
 *
 * Pricing everything at the Highlands rate would overprice the 96% of orders
 * going to the mainland; pricing everything at the mainland rate quietly loses
 * money on the rest. The blend is the honest single number, and
 * `delivery.zone2SharePct` is the only assumption in it.
 */
export function blendedDeliveryCost(supplierValue: number, config: PricingConfig = getPricingConfig()): number {
  const share = Math.min(1, Math.max(0, config.delivery.zone2SharePct))
  const zone1 = quoteDelivery({ supplierValue, zone: 'uk-1' }, config)
  const zone2 = quoteDelivery({ supplierValue, zone: 'uk-2' }, config)
  // When a weight can't go to Zone 2 at all, those orders simply don't happen
  // there, so the mainland cost is the whole story rather than a free ride.
  if (zone2.unavailableReason) return zone1.supplierCost
  return round(zone1.supplierCost * (1 - share) + zone2.supplierCost * share)
}

/**
 * Shipped weight for a quantity of a product, falling back to a configured
 * default when a product has no weight recorded.
 *
 * The fallback exists so the margin model covers the whole catalogue rather
 * than the tidy half of it — but a guessed weight makes a guessed delivery
 * cost, so `weightKnown` is reported alongside and the hub says so.
 */
export function shipmentWeight(
  products: { weightGrams?: number | null; quantity?: number }[],
  config: PricingConfig = getPricingConfig(),
): { grams: number; weightKnown: boolean } {
  let grams = 0
  let known = true
  for (const p of products) {
    const qty = Math.max(1, p.quantity ?? 1)
    if (p.weightGrams == null || p.weightGrams <= 0) {
      known = false
      grams += config.delivery.defaultProductGrams * qty
    } else {
      grams += p.weightGrams * qty
    }
  }
  return { grams, weightKnown: known }
}

/** Our position on one rung of the customer ladder. */
export interface DeliveryBandImpact {
  /** Basket ceiling for this rung (£ inc VAT), or null for "and above". */
  upTo: number | null
  /** What the member pays in it (£ inc VAT). */
  charge: number
  /** What we keep of that after VAT (£). */
  chargeNet: number
  /** `chargeNet − supplierCost` (£). Positive = postage pays for itself. */
  net: number
}

export interface FreeDeliveryImpact {
  /** Our own threshold (£ inc VAT, at our retail prices). */
  threshold: number
  /** What we charge on the ENTRY rung (£ inc VAT) — the smallest basket. */
  charge: number
  /** What we keep of that after VAT (£). */
  chargeNet: number
  /** What the supplier charges us for a typical parcel (£). */
  supplierCost: number
  /** Net position on an order BELOW the threshold (£). Positive = postage pays for itself. */
  belowThreshold: number
  /** Net position on an order ABOVE it (£). Always negative — the whole cost. */
  aboveThreshold: number
  /**
   * The position rung by rung.
   *
   * `belowThreshold` was the whole story when there was one charge and one
   * cliff. On a ladder it is only the entry rung, and the interesting number is
   * usually the one in the middle — the band that collects something but not
   * enough. Both are kept so nothing reading the old fields breaks.
   */
  bands: DeliveryBandImpact[]
}

/**
 * What our free-delivery offer actually costs.
 *
 * Worth stating plainly because the two sides look symmetrical and are not.
 * Below the threshold the member's postage roughly pays the supplier's charge,
 * so delivery is near enough free to us. Above it we collect nothing and still
 * pay the full charge — every qualifying order carries it. That is the price of
 * the promise, and it is a marketing cost, not a fulfilment one.
 *
 * It has NOTHING to do with PowerBody's own free-shipping thresholds, which sit
 * on their wholesale values and which dropshipping does not qualify for at all.
 */
export function freeDeliveryImpact(
  supplierValue: number,
  config: PricingConfig = getPricingConfig(),
): FreeDeliveryImpact {
  const supplierCost = blendedDeliveryCost(supplierValue, config)
  // The entry rung — what a small order pays, which is the case this impact
  // model is about: whether postage pays for itself on the baskets that carry it.
  const charge = entryDeliveryCharge(config)
  const chargeNet = revenueFromShelfPrice(charge, config.vat.standardRate, config)
  const bands = customerRates(config).map((rate) => {
    const net = revenueFromShelfPrice(rate.price, config.vat.standardRate, config)
    return {
      upTo: rate.maxOrderValue,
      charge: round(rate.price),
      chargeNet: net,
      net: round(net - supplierCost),
    }
  })
  return {
    threshold: config.freeDeliveryThreshold,
    charge,
    chargeNet,
    supplierCost,
    belowThreshold: round(chargeNet - supplierCost),
    aboveThreshold: round(-supplierCost),
    bands,
  }
}

/**
 * Monthly delivery cost for something that ships every `shipEveryMonths`.
 *
 * Subscriptions bill one smoothed monthly amount but do not necessarily ship
 * every month, so a per-shipment cost has to be spread the same way the goods
 * are — otherwise a product that ships quarterly looks three times as expensive
 * to deliver as it is.
 */
export function monthlyDeliveryCost(
  supplierValue: number,
  shipEveryMonths: number,
  config: PricingConfig = getPricingConfig(),
): number {
  const months = Math.max(1, shipEveryMonths)
  return round(blendedDeliveryCost(supplierValue, config) / months)
}
