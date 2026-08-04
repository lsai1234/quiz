/**
 * Delivery economics — PowerBody's real dropship rate card.
 *
 * WHAT CHANGED AND WHY IT MATTERS
 * ───────────────────────────────
 * This used to model delivery as "a cost per parcel plus a bit per unit, free
 * over some threshold". PowerBody's guide says otherwise on every count:
 *
 *   • It is priced by WEIGHT and ZONE, not per parcel. A 500g tub on Royal Mail
 *     Tracked 48 is £3.25; the same order to the Highlands is £4.49; over 7kg it
 *     has to go DPD at £5.17.
 *   • There is NO free-shipping threshold. "Next Day Delivery and Free Delivery
 *     are not available to Dropshippers." Every order carries a charge.
 *   • It is not postage. The charge covers picking, packaging, invoice printing,
 *     labour, storage and shipping — a fulfilment fee, which is why it is so
 *     large next to a £20 tub and why it can never be waved away.
 *
 * Two numbers hide behind the word "delivery" and confusing them is how a
 * catalogue goes quietly unprofitable: what the SUPPLIER charges US, and what we
 * charge the MEMBER. On anything over our free-delivery threshold the second is
 * zero, and the gap is a real cost the sell price has to carry.
 *
 * All supplier prices here are EX VAT, as PowerBody quote them; what that
 * actually costs us depends on whether we can reclaim it (see `./vat.ts`).
 *
 * Pure functions — the hub can preview a rate-card change before saving it.
 */
import {
  getPricingConfig,
  type PricingConfig,
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

/** One shipment, as the supplier would weigh it. */
export interface Shipment {
  /** Total shipped weight (g) — the only thing the rate card cares about. */
  grams: number
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

/** Every service that could carry this weight to this zone, cheapest first. */
export function eligibleServices(
  grams: number,
  zone: DeliveryZone,
  config: PricingConfig = getPricingConfig(),
): DeliveryService[] {
  return config.delivery.services
    .filter((s) => s.zone === zone && grams > s.minGrams && grams <= s.maxGrams)
    .sort((a, b) => a.price - b.price)
}

/**
 * The service the supplier would actually use: the cheapest that can carry it.
 *
 * Weight bands are treated as (min, max] so a weight sitting exactly on a
 * boundary — 1990g, where DPD's light and heavy bands meet — lands in the lower
 * band rather than qualifying for both and picking whichever sorted first.
 */
export function selectService(
  grams: number,
  zone: DeliveryZone,
  config: PricingConfig = getPricingConfig(),
): DeliveryService | null {
  if (grams <= 0) return null
  return eligibleServices(grams, zone, config)[0] ?? null
}

/** What we charge the member for a shipment of this value (£ inc VAT). */
export function customerDeliveryCharge(orderValue: number, config: PricingConfig = getPricingConfig()): number {
  if (orderValue <= 0) return 0
  const { freeDeliveryThreshold } = config
  if (freeDeliveryThreshold > 0 && orderValue >= freeDeliveryThreshold) return 0
  return round(config.delivery.customerDeliveryCharge)
}

/** Both sides of one shipment's delivery, and what it leaves us carrying. */
export function quoteDelivery(shipment: Shipment, config: PricingConfig = getPricingConfig()): DeliveryQuote {
  // A known postcode beats an assumed zone every time.
  const fromPostcode = shipment.postcode ? zoneForPostcode(shipment.postcode) : null
  const zone: DeliveryZone = fromPostcode?.zone ?? shipment.zone ?? config.delivery.defaultZone
  const grams = Math.max(0, shipment.grams)

  if (fromPostcode?.excluded) {
    return {
      service: null,
      zone,
      grams,
      supplierPriceExVat: 0,
      supplierCost: 0,
      customerCharge: customerDeliveryCharge(shipment.orderValue ?? 0, config),
      absorbed: 0,
      freeForCustomer: false,
      unavailableReason: fromPostcode.reason,
    }
  }
  const service = selectService(grams, zone, config)

  const supplierPriceExVat = service?.price ?? 0
  const supplierCost = service ? costFromSupplierPrice(supplierPriceExVat, config) : 0
  const customerCharge = customerDeliveryCharge(shipment.orderValue ?? 0, config)

  return {
    service,
    zone,
    grams,
    supplierPriceExVat: round(supplierPriceExVat),
    supplierCost,
    customerCharge,
    absorbed: round(Math.max(0, supplierCost - customerCharge)),
    freeForCustomer: customerCharge === 0,
    unavailableReason:
      grams <= 0
        ? 'No shipped weight recorded'
        : service
          ? null
          : `Nothing on the rate card carries ${grams}g to ${ZONE_LABELS[zone]}`,
  }
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
export function blendedDeliveryCost(grams: number, config: PricingConfig = getPricingConfig()): number {
  const share = Math.min(1, Math.max(0, config.delivery.zone2SharePct))
  const zone1 = quoteDelivery({ grams, zone: 'uk-1' }, config)
  const zone2 = quoteDelivery({ grams, zone: 'uk-2' }, config)
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

export interface FreeDeliveryImpact {
  /** Our own threshold (£ inc VAT, at our retail prices). */
  threshold: number
  /** What we charge below it (£ inc VAT). */
  charge: number
  /** What we keep of that after VAT (£). */
  chargeNet: number
  /** What the supplier charges us for a typical parcel (£). */
  supplierCost: number
  /** Net position on an order BELOW the threshold (£). Positive = postage pays for itself. */
  belowThreshold: number
  /** Net position on an order ABOVE it (£). Always negative — the whole cost. */
  aboveThreshold: number
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
  grams: number,
  config: PricingConfig = getPricingConfig(),
): FreeDeliveryImpact {
  const supplierCost = blendedDeliveryCost(grams, config)
  const charge = round(config.delivery.customerDeliveryCharge)
  const chargeNet = revenueFromShelfPrice(charge, config.vat.standardRate, config)
  return {
    threshold: config.freeDeliveryThreshold,
    charge,
    chargeNet,
    supplierCost,
    belowThreshold: round(chargeNet - supplierCost),
    aboveThreshold: round(-supplierCost),
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
  grams: number,
  shipEveryMonths: number,
  config: PricingConfig = getPricingConfig(),
): number {
  const months = Math.max(1, shipEveryMonths)
  return round(blendedDeliveryCost(grams, config) / months)
}
