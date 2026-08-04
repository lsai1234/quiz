/**
 * Delivery economics for dropship fulfilment.
 *
 * Two different numbers hide behind the word "delivery" and confusing them is
 * how a catalogue ends up quietly unprofitable:
 *
 *   • what the SUPPLIER charges US to put a parcel on a courier, and
 *   • what we charge the MEMBER for it.
 *
 * They are rarely equal, and on a subscription that clears the free-delivery
 * threshold the second one is zero. The gap — `absorbed` — is a real cost of
 * goods that has to be carried by the sell price, which is exactly what the
 * Good-price model does with this.
 *
 * The rate card itself lives in `PRICING_CONFIG.delivery` so the Founders Hub
 * can edit it, and so plugging in PowerBody's real numbers when the supplier
 * integration lands is one edit rather than a hunt through the codebase.
 *
 * Pure functions — no I/O, no supplier calls — so the hub can preview a change
 * before saving it and the tests can pin the maths down exactly.
 */
import { getPricingConfig, type PricingConfig } from '@/lib/stack-blueprint/pricing'

const round = (n: number) => Math.round(n * 100) / 100

/** One physical shipment, as the supplier would pack it. */
export interface Shipment {
  /** Units going in the box. */
  units: number
  /** Goods value of those units at what we PAY (£) — sets the supplier's free-shipping test. */
  goodsValue: number
  /** What the member is being charged for the goods in this shipment (£).
   *  Sets whether they qualify for free delivery. Defaults to `goodsValue`. */
  orderValue?: number
}

export interface DeliveryQuote {
  /** Parcels the supplier will split this into. */
  parcels: number
  /** What the supplier charges us (£). */
  supplierCost: number
  /** What the member is charged (£). */
  customerCharge: number
  /** What we carry ourselves — supplier cost minus what we collected (£).
   *  Never negative: collecting more than it cost is margin, not negative cost. */
  absorbed: number
  /** True when the member pays nothing for delivery. */
  freeForCustomer: boolean
}

/**
 * How many parcels a shipment splits into. Zero units is zero parcels — an empty
 * shipment is not a free one, it is not a shipment.
 */
export function parcelsFor(units: number, config: PricingConfig = getPricingConfig()): number {
  if (units <= 0) return 0
  const per = Math.max(1, config.delivery.unitsPerParcel)
  return Math.ceil(units / per)
}

/** What the supplier charges us to ship one shipment (£). */
export function supplierDeliveryCost(shipment: Shipment, config: PricingConfig = getPricingConfig()): number {
  const parcels = parcelsFor(shipment.units, config)
  if (parcels === 0) return 0
  const { supplierFreeParcelThreshold, supplierParcelCost, supplierPerUnitCost } = config.delivery
  // A free-shipping deal is struck on the value of the consignment, so it applies
  // to the whole shipment rather than being pro-rated across its parcels.
  if (supplierFreeParcelThreshold > 0 && shipment.goodsValue >= supplierFreeParcelThreshold) return 0
  return round(parcels * supplierParcelCost + shipment.units * supplierPerUnitCost)
}

/** What we charge the member for a shipment of this value (£). */
export function customerDeliveryCharge(orderValue: number, config: PricingConfig = getPricingConfig()): number {
  if (orderValue <= 0) return 0
  const { freeDeliveryThreshold } = config
  if (freeDeliveryThreshold > 0 && orderValue >= freeDeliveryThreshold) return 0
  return round(config.delivery.customerDeliveryCharge)
}

/** Both sides of one shipment's delivery, and what it leaves us carrying. */
export function quoteDelivery(shipment: Shipment, config: PricingConfig = getPricingConfig()): DeliveryQuote {
  const parcels = parcelsFor(shipment.units, config)
  const supplierCost = supplierDeliveryCost(shipment, config)
  const customerCharge = customerDeliveryCharge(shipment.orderValue ?? shipment.goodsValue, config)
  return {
    parcels,
    supplierCost,
    customerCharge,
    absorbed: round(Math.max(0, supplierCost - customerCharge)),
    freeForCustomer: customerCharge === 0,
  }
}

/**
 * Monthly delivery cost for something that ships every `shipEveryMonths`.
 *
 * Subscriptions are billed as one smoothed monthly amount but do not necessarily
 * ship every month, so a per-shipment cost has to be spread the same way the
 * goods are — otherwise a product that ships quarterly looks three times as
 * expensive to deliver as it is.
 */
export function monthlyDeliveryCost(
  shipment: Shipment,
  shipEveryMonths: number,
  config: PricingConfig = getPricingConfig(),
): number {
  const months = Math.max(1, shipEveryMonths)
  return round(supplierDeliveryCost(shipment, config) / months)
}
