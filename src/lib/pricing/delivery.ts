/**
 * Delivery economics — PowerBody's rate card and ours.
 *
 * WHAT POWERBODY CHARGE US: BY WEIGHT
 * ───────────────────────────────────
 * Their Dropshipping Guide (June 2026), ex VAT:
 *
 *     Royal Mail Tracked 48   up to 7 kg     £3.25   (Highlands £4.49)
 *     DPD Two Day             up to 1.99 kg  £4.75
 *     DPD Two Day             up to 30 kg    £5.17
 *
 * Every order goes with the cheapest service that can carry it, and asks for
 * it by code, so it is Royal Mail for almost every box (most products weigh
 * 100 g to 1 kg) and DPD only over 7 kg. Nothing to the Highlands over 7 kg:
 * no service takes it, so those orders are held. Dropshippers get no free
 * delivery, so every parcel costs us something.
 *
 * This replaced a card banded on what we spend with them per order, taken from
 * their public site, which put a parcel at £6.60–£7.80 against a real £3.90.
 *
 * WHAT WE CHARGE THE MEMBER: BY BASKET
 * ────────────────────────────────────
 * `delivery.customerRates`, on the retail total: £2 under £20, free from £20.
 * The two ladders band on different things and are never the same number; the
 * gap between them is a real cost the shelf price carries.
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
  type DeliveryCarrier,
  type DeliveryZone,
  type DeliveryService,
} from '@/lib/stack-blueprint/pricing'
import { costFromSupplierPrice, revenueFromShelfPrice } from './vat'
import { zoneForPostcode } from './zones'

const round = (n: number) => Math.round(n * 100) / 100

export type { DeliveryCarrier, DeliveryZone, DeliveryService }

export const ZONE_LABELS: Record<DeliveryZone, string> = {
  'uk-1': 'UK mainland',
  'uk-2': 'Highlands',
  eu: 'EU',
}

export const CARRIER_LABELS: Record<DeliveryCarrier, string> = {
  'royal-mail': 'Royal Mail',
  dpd: 'DPD',
  ups: 'UPS',
}

/** One shipment, as the supplier would price it. */
export interface Shipment {
  /** Shipped weight (g). Null or absent: one product at `defaultProductGrams`. */
  grams?: number | null
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
   */
  orderValue?: number
}

export interface DeliveryQuote {
  /** The service the supplier would use, or null when nothing can carry it. */
  service: DeliveryService | null
  zone: DeliveryZone
  /** The weight the service was chosen on (g). */
  grams: number
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
 * The services that can carry a parcel this heavy to this zone, cheapest first.
 */
export function eligibleServices(
  grams: number,
  zone: DeliveryZone,
  config: PricingConfig = getPricingConfig(),
): DeliveryService[] {
  return config.delivery.services
    .filter((s) => s.zone === zone && (s.maxGrams == null || grams <= s.maxGrams))
    .sort((a, b) => a.price - b.price || (a.maxGrams ?? Infinity) - (b.maxGrams ?? Infinity))
}

/** The service a parcel goes with: the cheapest that can carry it, or null. */
export function selectService(
  grams: number,
  zone: DeliveryZone,
  config: PricingConfig = getPricingConfig(),
): DeliveryService | null {
  if (!(grams > 0)) return null
  return eligibleServices(grams, zone, config)[0] ?? null
}

/** The heaviest parcel any service takes to this zone (g), or null for no limit. */
export function heaviestParcel(zone: DeliveryZone, config: PricingConfig = getPricingConfig()): number | null {
  const services = config.delivery.services.filter((s) => s.zone === zone)
  if (!services.length) return 0
  if (services.some((s) => s.maxGrams == null)) return null
  return Math.max(...services.map((s) => s.maxGrams ?? 0))
}

/* ── Weight ──────────────────────────────────────────────────────────────── */

const LABEL_MASS = /([\d.]+)\s*(kg|g)\b/i

/**
 * The weight printed on a size label ("1kg", "Chocolate / 500 g"), in grams,
 * or null when it isn't a weight (capsules, a count, nothing).
 */
export function labelGrams(size: string | null | undefined): number | null {
  const m = size?.match(LABEL_MASS)
  if (!m) return null
  const value = Number(m[1]) * (m[2].toLowerCase() === 'kg' ? 1000 : 1)
  return Number.isFinite(value) && value > 0 ? value : null
}

/** Where a unit's shipped weight came from. */
export type WeightSource = 'weight' | 'label' | 'default'

/**
 * The shipped weight of one unit (g), best figure first:
 *
 *   weight   PowerBody's, or one typed in at import review
 *   label    the size on the label plus `packagingAllowancePct` (1 kg → 1.15 kg)
 *   default  `defaultProductGrams`
 */
export function unitGrams(
  unit: { weightGrams?: number | null; size?: string | null },
  config: PricingConfig = getPricingConfig(),
): { grams: number; source: WeightSource } {
  if (unit.weightGrams != null && unit.weightGrams > 0) return { grams: unit.weightGrams, source: 'weight' }
  const label = labelGrams(unit.size)
  if (label != null) return { grams: Math.round(label * (1 + config.delivery.packagingAllowancePct)), source: 'label' }
  return { grams: config.delivery.defaultProductGrams, source: 'default' }
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
 * A Zone 2 surcharge, when one is set, applies to the free band too: our cost
 * up there is higher on every parcel, not just the small ones. It is 0 today.
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
 * One, "UK delivery", while the Highlands pay what everyone else pays
 * (`zone2Surcharge` 0). With a surcharge, two, because of a Stripe constraint:
 * Checkout fixes its shipping options when the SESSION is created, before the
 * customer has typed an address, so a rate cannot react to their postcode the
 * way `quoteDelivery` can. The customer self-selects, and `deliverability` /
 * `zoneForPostcode` check the choice against the address they gave — the
 * fulfilment queue flags a mainland rate paid on a Highlands postcode.
 */
export function deliveryOptions(orderValue: number, config: PricingConfig = getPricingConfig()): DeliveryOption[] {
  const mainland = customerDeliveryCharge(orderValue, 'uk-1', config)
  const highlands = customerDeliveryCharge(orderValue, 'uk-2', config)
  if (highlands === mainland) return [{ id: 'uk-mainland', zone: 'uk-1', label: 'UK delivery', price: mainland }]
  return [
    { id: 'uk-mainland', zone: 'uk-1', label: 'UK mainland', price: mainland },
    { id: 'uk-highlands', zone: 'uk-2', label: 'Highlands', price: highlands },
  ]
}

/**
 * The ONE delivery rate a subscription bills each month.
 *
 * Stripe Checkout accepts `shipping_options` in `payment` mode only — a
 * subscription Session carrying them is refused outright, which is exactly how
 * every subscription checkout came to die on "we couldn't start your payment".
 * So a monthly plan cannot offer the mainland-or-Highlands pick that a one-off
 * basket does. Postage rides as a second recurring line item instead, and this
 * is the rate it rides at.
 *
 * The mainland rate, deliberately: it is the number `PlanReceipt` has already
 * quoted the member on the way in, and the one ~96% of orders would have picked.
 * A Highlands plan therefore pays a mainland rate — the same position as a
 * one-off order where someone picks the cheaper option, which the fulfilment
 * queue already checks against the address (`deliveryShortfall`), rather than a
 * new hole in the model.
 *
 * Null when this basket ships free, so no £0.00 postage line appears on the
 * member's invoice every month.
 */
export function recurringDeliveryOption(
  orderValue: number,
  config: PricingConfig = getPricingConfig(),
): DeliveryOption | null {
  const mainland = deliveryOptions(orderValue, config).find((o) => o.zone === 'uk-1')
  return mainland && mainland.price > 0 ? mainland : null
}

/** Both sides of one shipment's delivery, and what it leaves us carrying. */
export function quoteDelivery(shipment: Shipment, config: PricingConfig = getPricingConfig()): DeliveryQuote {
  // A known postcode beats an assumed zone every time.
  const fromPostcode = shipment.postcode ? zoneForPostcode(shipment.postcode) : null
  const zone: DeliveryZone = fromPostcode?.zone ?? shipment.zone ?? config.delivery.defaultZone
  const grams = shipment.grams != null && shipment.grams > 0 ? shipment.grams : config.delivery.defaultProductGrams
  const customerCharge = customerDeliveryCharge(shipment.orderValue ?? 0, zone, config)

  if (fromPostcode?.excluded) {
    return {
      service: null,
      zone,
      grams,
      supplierPriceExVat: 0,
      supplierCost: 0,
      customerCharge,
      absorbed: 0,
      freeForCustomer: false,
      unavailableReason: fromPostcode.reason,
    }
  }
  const service = selectService(grams, zone, config)
  const supplierPriceExVat = service?.price ?? 0
  // Delivery is standard-rated, whatever the goods are.
  const supplierCost = service ? costFromSupplierPrice(supplierPriceExVat, config) : 0

  return {
    service,
    zone,
    grams,
    supplierPriceExVat: round(supplierPriceExVat),
    supplierCost,
    customerCharge,
    absorbed: round(Math.max(0, supplierCost - customerCharge)),
    freeForCustomer: customerCharge === 0,
    unavailableReason: service
      ? null
      : `No delivery service takes a ${(grams / 1000).toFixed(1)} kg parcel to the ${ZONE_LABELS[zone]}`,
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
 * the zones we actually ship to, for a parcel this heavy.
 *
 * Pricing everything at the Highlands rate would overprice the 96% of orders
 * going to the mainland; pricing everything at the mainland rate quietly loses
 * money on the rest. The blend is the honest single number, and
 * `delivery.zone2SharePct` is the only assumption in it.
 */
export function blendedDeliveryCost(grams?: number | null, config: PricingConfig = getPricingConfig()): number {
  const share = Math.min(1, Math.max(0, config.delivery.zone2SharePct))
  const zone1 = quoteDelivery({ grams, zone: 'uk-1' }, config)
  const zone2 = quoteDelivery({ grams, zone: 'uk-2' }, config)
  // When a weight can't go to Zone 2 at all, those orders simply don't happen
  // there, so the mainland cost is the whole story rather than a free ride.
  if (zone2.unavailableReason) return zone1.supplierCost
  return round(zone1.supplierCost * (1 - share) + zone2.supplierCost * share)
}

/**
 * Shipped weight of a parcel (g), with each unit's weight from `unitGrams`.
 *
 * Every product has a figure, so the margin model covers the whole catalogue —
 * but a guessed weight makes a guessed delivery cost, so `weightKnown` (every
 * unit had a real weight) is reported alongside and the hub says so.
 */
export function shipmentWeight(
  products: { weightGrams?: number | null; size?: string | null; quantity?: number }[],
  config: PricingConfig = getPricingConfig(),
): { grams: number; weightKnown: boolean } {
  let grams = 0
  let known = true
  for (const p of products) {
    const qty = Math.max(1, p.quantity ?? 1)
    const unit = unitGrams(p, config)
    if (unit.source !== 'weight') known = false
    grams += unit.grams * qty
  }
  return { grams, weightKnown: known }
}

/** A basket's parcel weight (g): each line's product and the size it was chosen in. */
export function basketGrams(
  lines: { product: { weightGrams?: number | null }; variant?: { size?: string | null } | null; quantity: number }[],
  config: PricingConfig = getPricingConfig(),
): number {
  return shipmentWeight(
    lines.map((l) => ({ weightGrams: l.product.weightGrams ?? null, size: l.variant?.size ?? null, quantity: l.quantity })),
    config,
  ).grams
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
 * Dropshipping gets no free delivery from PowerBody, so every parcel costs us
 * its service's price whatever the basket.
 */
export function freeDeliveryImpact(
  grams?: number | null,
  config: PricingConfig = getPricingConfig(),
): FreeDeliveryImpact {
  const supplierCost = blendedDeliveryCost(grams, config)
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
  grams: number | null | undefined,
  shipEveryMonths: number,
  config: PricingConfig = getPricingConfig(),
): number {
  const months = Math.max(1, shipEveryMonths)
  return round(blendedDeliveryCost(grams, config) / months)
}
