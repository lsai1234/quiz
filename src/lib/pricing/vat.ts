/**
 * VAT — the difference between a margin and a fantasy.
 *
 * THE MISTAKE THIS EXISTS TO PREVENT
 * ──────────────────────────────────
 * Our shelf prices are quoted INCLUSIVE of VAT, because UK consumer law
 * requires a price shown to a consumer to be the price they pay. PowerBody
 * quote us EXCLUSIVE of VAT — their guide prints "£4.75 (+ VAT = £5.70)".
 *
 * Subtract one from the other and you have counted HMRC's money as profit.
 * On a £30 sale that is £5. Across a catalogue it is the difference between a
 * business that works and one that doesn't, and it is invisible because both
 * numbers look like prices.
 *
 * So: every margin in `lib/pricing/*` is computed on NET revenue against NET
 * costs. `netFromGross` and `grossFromNet` are the only two conversions, and
 * everything goes through them.
 *
 * REGISTERED OR NOT IS A DIFFERENT BUSINESS
 * ─────────────────────────────────────────
 * Registered: we add VAT to the shelf price and hand it over, but reclaim any
 * VAT PowerBody charged us — costs are net.
 * Not registered: we keep the whole shelf price (no VAT to hand over) but
 * cannot reclaim, so whatever VAT PowerBody charge us is a real, permanent
 * cost. Whether they charge any is `config.vat.supplierChargesVat` — off by
 * default, because the founder says we are not paying VAT at the moment.
 *
 * Below the registration threshold the second is usually better; above it there
 * is no choice. `config.vat.registered` picks, and it changes both sides of the
 * calculation — which is why it is a pricing rule and not a display option.
 */
import { getPricingConfig, type PricingConfig } from '@/lib/stack-blueprint/pricing'

const round = (n: number) => Math.round(n * 100) / 100

/** The VAT rate applying to a product — its own, or the standard rate. */
export function vatRateFor(
  product: { vatRate?: number | null } | null | undefined,
  config: PricingConfig = getPricingConfig(),
): number {
  const own = product?.vatRate
  // 0 is a legitimate rate (zero-rated food), so only null/undefined fall back.
  return own == null ? config.vat.standardRate : own
}

/** Strip VAT out of a consumer price: what we actually keep from £X on the shelf. */
export function netFromGross(gross: number, rate: number): number {
  return round(gross / (1 + rate))
}

/** Add VAT to a net price: what a consumer price has to be to net £X. */
export function grossFromNet(net: number, rate: number): number {
  return round(net * (1 + rate))
}

/** The VAT inside a consumer price. */
export function vatOn(gross: number, rate: number): number {
  return round(gross - netFromGross(gross, rate))
}

/**
 * What a shelf price is really worth to us.
 *
 * When we're registered, VAT comes straight out. When we're not, we keep the
 * lot — there is no VAT in the price because we never charged any.
 */
export function revenueFromShelfPrice(
  gross: number,
  rate: number,
  config: PricingConfig = getPricingConfig(),
): number {
  return config.vat.registered ? netFromGross(gross, rate) : round(gross)
}

/**
 * Whether PowerBody's VAT is a cost to us: they charge it
 * (`vat.supplierChargesVat`) and we cannot reclaim it (not registered).
 *
 * The one place that decision is made. Anything that grosses a supplier price
 * up — or solves for a price that will be — reads this, so the switch in the
 * hub moves every margin together.
 */
export function supplierVatIsCost(config: PricingConfig = getPricingConfig()): boolean {
  return config.vat.supplierChargesVat && !config.vat.registered
}

/**
 * What a supplier's ex-VAT price really costs us.
 *
 * When their VAT is a cost (`supplierVatIsCost`: they charge it and we are not
 * registered to reclaim it), the cost is what we actually pay them — the ex-VAT
 * price plus VAT at the standard rate. Otherwise it is the ex-VAT figure we were
 * quoted: registered, we reclaim their VAT; with `supplierChargesVat` off, there
 * is none to pay. PowerBody's rate card is quoted ex VAT throughout, so this
 * applies to delivery as much as to goods.
 */
export function costFromSupplierPrice(
  exVat: number,
  config: PricingConfig = getPricingConfig(),
): number {
  return supplierVatIsCost(config) ? round(exVat * (1 + config.vat.standardRate)) : round(exVat)
}
