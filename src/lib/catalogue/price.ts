import type { CatalogueProduct, CatalogueVariant } from './types'
import { listPriceFor } from '@/lib/pricing/list-price'
import { getPricingConfig, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import { masterVariant } from './master'

/**
 * What a SKU costs us, what the rule makes of that, and what we actually charge.
 *
 * ── Why a price needs to say where it came from ─────────────────────────────
 * Every price in the shop is computed: `listPriceFor` takes what PowerBody
 * charge us and marks it up (see `pricing/list-price`). That is the right
 * default and it is the whole catalogue's pricing policy — but it is a policy,
 * not a law, and a founder looking at one product sometimes knows something the
 * rule does not. A product that has to match a price everyone can see; a loss
 * leader; a line where the supplier's cost has jumped and the shelf price is
 * staying put until the next order lands.
 *
 * Before this, typing a price was possible only in the sense that the number
 * could be written into an override — and the next supplier pull would compute
 * it away again, because nothing recorded that a person had chosen it. So the
 * price carries its own provenance now: absent means the rule computed it, and
 * `'founder'` means somebody typed it and every pull leaves it alone, INCLUDING
 * a forced one. An override a sweep can quietly undo is not an override.
 *
 * ── Per SKU, because that is what a price belongs to ────────────────────────
 * The shop prices a variant, and the product quotes its master (see `master`).
 * So an override is set on one SKU, and the product-level `basePrice` follows
 * it only when that SKU is the one the product presents itself as — the same
 * rule `masterPatch` and the repair pass already keep.
 *
 * Pure: no network, no database. The route (`api/portal/products/price`) reads
 * the product and writes what comes back; everything about what a price means
 * is decided here, where it can be tested without either.
 */

const round = (n: number) => Math.round(n * 100) / 100

/** What we pay for this SKU: its own cost, or the product's when it has none. */
export function costFor(product: CatalogueProduct, variant: CatalogueVariant): number | null {
  const cost = variant.cost ?? product.cost ?? null
  return cost != null && cost > 0 ? round(cost) : null
}

/**
 * What the rule would charge for this SKU, or null when nothing can be
 * computed.
 *
 * Null is a real answer and the common one on a product nobody has pulled yet:
 * with no supplier price on file there is no rule price, and inventing one from
 * the shelf price would be circular. The screen says so rather than showing a
 * figure that means nothing.
 */
export function rulePriceFor(
  product: CatalogueProduct,
  variant: CatalogueVariant,
  config: PricingConfig = getPricingConfig(),
): number | null {
  const cost = costFor(product, variant)
  if (cost == null) return null
  const price = listPriceFor(cost, config)
  return price > 0 ? price : null
}

/** One SKU's prices, in the columns the decision is made from. */
export interface PriceRow {
  variantId: string
  /** What to call this row: its supplier code where there is one, else its name. */
  label: string
  /** The SKU's own name, for the row that has a code as its label. */
  title: string
  sku: string | null
  /** What the shop charges for it today (£). */
  price: number
  /** What PowerBody charge us (£ ex VAT), when anything knows. */
  cost: number | null
  /**
   * The supplier's own recommended retail price, when we recorded one.
   *
   * `supplierRrp` and not the variant's `compareAtPrice`: those are two
   * different claims wearing the same shape. One is what PowerBody say the
   * product is worth; the other is the "was" price the card draws, which on a
   * product nobody imported is a marketing figure of ours. Labelling the second
   * as theirs would put words in their mouth on exactly the screen where a
   * founder is deciding what to charge.
   */
  rrp: number | null
  /** The "was" price the shop is drawing, when it is above what we charge. */
  wasPrice: number | null
  /** What our own rule makes of the cost (£), or null when there is no cost. */
  rulePrice: number | null
  /** True when the price on the shelf is one a founder typed. */
  manual: boolean
  /** True for the SKU the product quotes — the one whose price is the product's. */
  isMaster: boolean
  /** True when the shelf price does not cover what we pay for it. */
  belowCost: boolean
}

/**
 * Every SKU of a product, priced three ways: theirs, the rule's, and ours.
 *
 * Computed on the server and handed to the screen rather than worked out in the
 * browser, because the markup is a founder-editable setting (`listPricing`) and
 * the client holds the defaults. A panel that quoted "the rule says £29.99"
 * from a stale multiplier would be worse than one that quoted nothing.
 */
export function priceRows(
  product: CatalogueProduct,
  config: PricingConfig = getPricingConfig(),
): PriceRow[] {
  const master = masterVariant(product)
  return product.variants.map((variant) => {
    const cost = costFor(product, variant)
    return {
      variantId: variant.id,
      label: variant.sku ?? variant.title,
      title: variant.title,
      sku: variant.sku ?? null,
      price: variant.price,
      cost,
      rrp: product.supplierRrp != null && product.supplierRrp > 0 ? product.supplierRrp : null,
      // Only when it is actually being drawn: the shop refuses to show a "was"
      // that is not above the price, so quoting one here would describe a
      // saving no customer is being offered.
      wasPrice:
        variant.compareAtPrice != null && variant.compareAtPrice > variant.price
          ? variant.compareAtPrice
          : null,
      rulePrice: rulePriceFor(product, variant, config),
      manual: variant.priceSource === 'founder',
      isMaster: master?.id === variant.id,
      belowCost: cost != null && variant.price > 0 && variant.price < cost,
    }
  })
}

/**
 * Price one SKU by hand.
 *
 * The product's own price moves with it only when the SKU is the master, for
 * the reason the module header gives: `basePrice` is what every summary quotes,
 * and it is the master's price by definition. Pricing a flavour nobody opens on
 * must not reprice the card.
 *
 * Returns null when nothing would change, so a caller can skip the write.
 */
export function setVariantPrice(
  product: CatalogueProduct,
  variantId: string,
  price: number,
): CatalogueProduct | null {
  const target = product.variants.find((v) => v.id === variantId)
  if (!target) return null

  const next = round(price)
  if (next <= 0) return null
  if (target.price === next && target.priceSource === 'founder') return null

  const variants = product.variants.map((v) =>
    v.id === variantId ? { ...v, price: next, priceSource: 'founder' as const } : v,
  )
  const isMaster = masterVariant(product)?.id === variantId
  return { ...product, variants, basePrice: isMaster ? next : product.basePrice }
}

/**
 * Put one SKU back on the rule.
 *
 * The way out of an override, and the reason a forced pull can leave manual
 * prices alone without trapping anybody: the founder who set the price is the
 * one who takes it off. Refused — null — when there is no supplier price on
 * file, because there is then no rule price to go back to, and dropping the
 * flag alone would leave a number that is neither the rule's nor anybody's.
 */
export function clearVariantPrice(
  product: CatalogueProduct,
  variantId: string,
  config: PricingConfig = getPricingConfig(),
): CatalogueProduct | null {
  const target = product.variants.find((v) => v.id === variantId)
  if (!target) return null

  const rule = rulePriceFor(product, target, config)
  if (rule == null) return null
  if (target.price === rule && target.priceSource !== 'founder') return null

  const variants = product.variants.map((v) =>
    v.id === variantId ? { ...v, price: rule, priceSource: 'rule' as const } : v,
  )
  const isMaster = masterVariant(product)?.id === variantId
  return { ...product, variants, basePrice: isMaster ? rule : product.basePrice }
}
