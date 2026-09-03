import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { ResolvedBasketLine } from '@/lib/basket/types'
import type { StackBlueprint } from '@/lib/stack-blueprint/types'
import { getPricingConfig, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import { priceBasket } from '@/lib/basket/helpers'
import { defaultVariant } from './merchandising'
import { activeOverlaps, overlapSentence, type ActiveOverlap } from './stack-radar'

/**
 * Basket Alchemy: what this basket is close to being.
 *
 * `BasketDrawer` already runs a free-delivery bar — the right idea, in the wrong
 * place, doing half the job. It lives behind a tap, so the shopper sees it after
 * they have stopped shopping; and it only knows about postage, while the shop
 * also sells curated bundles at a real discount and nothing compares a basket
 * against them.
 *
 * ── The honesty constraint that shapes the whole module ──────────────────────
 * A basket is priced à la carte. Adding the third product of a bundle to the
 * basket does NOT apply the bundle price — that is a different SKU on a
 * different page. So a bundle nudge may never say "add this and save £6.40",
 * because the basket would then charge full price and the promise would be a
 * lie at the till. It says what is true: these are the products in the Recovery
 * Stack, and buying them AS that bundle costs £6.40 less. The call to action is
 * the bundle page, not an add-to-basket.
 *
 * ── And the saving has to be the shopper's saving, not the brochure's ────────
 * `BundlePriceSummary.saving` compares a bundle against the UNDISCOUNTED sum of
 * its parts — which makes it, in this pricing model, exactly the £50+ tier
 * discount. The shop basket earns that same tier on the same products, so
 * quoting it here would advertise a saving the shopper already has. `bundleEdge`
 * below prices the bundle's products through the basket instead and reports only
 * what is genuinely left over, which is often nothing.
 *
 * Everything here is derived from the same engine the checkout bills from, so a
 * number on screen is a number we will honour.
 */

/** At most this many products missing before a bundle stops being "nearly there". */
export const MAX_MISSING_FOR_NUDGE = 2

/** The shape this module needs from a shop bundle. Structural so the lib does
 *  not depend on the hook that happens to fetch them. */
export interface NudgeBundle {
  bundle: { slug: string; name: string; blueprint: Pick<StackBlueprint, 'slots'> }
  price: { saving: number; price: number }
}

export interface BundleNudge {
  kind: 'bundle'
  /** Stable id, so a dismissal sticks to this suggestion and not to its position. */
  key: string
  slug: string
  name: string
  /** Products in the bundle that the basket does not have yet. */
  missing: CatalogueProduct[]
  /** How many of the bundle's products the basket already holds. */
  have: number
  /**
   * What the bundle costs LESS than the same products through the shop basket,
   * after the basket's own tier discount. Often 0 — the bundle is then still
   * worth naming as a curated stack, but there is no price claim to make.
   */
  saving: number
}

export interface DeliveryNudge {
  kind: 'delivery'
  key: 'delivery'
  /** How much more spend earns free delivery. */
  remaining: number
  threshold: number
}

/**
 * The same active arriving from two products. Not a sale — the opposite: it
 * usually means buy one, not two. See `stack-radar`.
 */
export interface OverlapNudge {
  kind: 'overlap'
  key: string
  /** Plain arithmetic, never advice. */
  sentence: string
  overlap: ActiveOverlap
}

export type BasketNudge = OverlapNudge | BundleNudge | DeliveryNudge

/**
 * What buying a bundle saves against the same products bought à la carte.
 *
 * Both sides go through the pricing the checkout actually bills, so the tier
 * discount the basket earns is on BOTH sides of the comparison and cancels —
 * leaving only a genuine bundle-exclusive advantage, if there is one. Floored at
 * zero: a bundle that costs more than its parts is not a saving to invert.
 */
export function bundleEdge(
  bundlePrice: number,
  products: CatalogueProduct[],
  config: PricingConfig = getPricingConfig(),
): number {
  const lines: ResolvedBasketLine[] = []
  for (const product of products) {
    const variant = defaultVariant(product)
    if (!variant) return 0
    lines.push({ product, variant, quantity: 1, lineTotal: variant.price })
  }
  if (lines.length === 0) return 0
  const alaCarte = priceBasket(lines, config).total
  return Math.max(0, Math.round((alaCarte - bundlePrice) * 100) / 100)
}

/** Buyable right now — a bundle you cannot complete is not a suggestion. */
function isBuyable(product: CatalogueProduct): boolean {
  return product.variants.some((v) => v.available)
}

/** The distinct core product ids a bundle is made of. */
export function bundleProductIds(blueprint: Pick<StackBlueprint, 'slots'>): string[] {
  return [...new Set(blueprint.slots.map((slot) => slot.selectedProductId))]
}

/**
 * Bundles this basket is one or two products short of, best first.
 *
 * "Best" is fewest missing, then biggest saving: being one product away is a far
 * stronger suggestion than being two away, whatever the money says.
 *
 * ── What counts as "nearly" ──────────────────────────────────────────────────
 * At most two missing, AND at least as many held as missing. The second half
 * matters more than it looks: without it, a single whey protein in the basket is
 * "one of the three products in the Early Shift", and every basket of one thing
 * gets a bundle pitched at it. That is an advert wearing a suggestion's clothes.
 * Holding half of something is the point at which finishing it is a real thought.
 *
 * Also skipped: a bundle the basket already holds in full, one whose missing
 * product cannot be bought today, and one that saves nothing against its parts.
 */
export function bundleNudges(
  resolved: ResolvedBasketLine[],
  bundles: NudgeBundle[],
  products: CatalogueProduct[],
  config: PricingConfig = getPricingConfig(),
): BundleNudge[] {
  const inBasket = new Set(resolved.map((line) => line.product.id))
  if (inBasket.size === 0) return []

  const byId = new Map(products.map((p) => [p.id, p]))
  const nudges: BundleNudge[] = []

  for (const view of bundles) {
    const ids = bundleProductIds(view.bundle.blueprint)
    if (ids.length === 0) continue

    const missingIds = ids.filter((id) => !inBasket.has(id))
    const have = ids.length - missingIds.length

    if (missingIds.length === 0) continue                      // already has it all
    if (missingIds.length > MAX_MISSING_FOR_NUDGE) continue
    if (have < missingIds.length) continue                     // an advert, not a near-miss

    const missing = missingIds.map((id) => byId.get(id)).filter((p): p is CatalogueProduct => !!p)
    // A product that has left the catalogue, or that nobody can buy today, makes
    // the bundle uncompletable — suggesting it would waste the tap.
    if (missing.length !== missingIds.length || !missing.every(isBuyable)) continue
    // The honest saving: this bundle against the same products through the
    // basket. Zero is a normal answer and not a reason to stay quiet — a stack
    // the shopper is one product from completing is worth naming either way.
    const all = ids.map((id) => byId.get(id)).filter((p): p is CatalogueProduct => !!p)
    const saving = all.length === ids.length ? bundleEdge(view.price.price, all, config) : 0

    nudges.push({
      kind: 'bundle',
      key: `bundle:${view.bundle.slug}`,
      slug: view.bundle.slug,
      name: view.bundle.name,
      missing,
      have,
      saving,
    })
  }

  return nudges.sort((a, b) => {
    if (a.missing.length !== b.missing.length) return a.missing.length - b.missing.length
    return b.saving - a.saving
  })
}

/**
 * How far this basket is from free delivery, or null when it is already there
 * (or when there is no threshold to reach).
 */
export function deliveryNudge(subtotal: number, config: PricingConfig = getPricingConfig()): DeliveryNudge | null {
  const threshold = config.freeDeliveryThreshold
  if (threshold <= 0 || subtotal <= 0 || subtotal >= threshold) return null
  return {
    kind: 'delivery',
    key: 'delivery',
    remaining: Math.round((threshold - subtotal) * 100) / 100,
    threshold,
  }
}

export interface NudgeInput {
  resolved: ResolvedBasketLine[]
  subtotal: number
  bundles: NudgeBundle[]
  products: CatalogueProduct[]
  /** Keys the shopper has already waved away this session. */
  dismissed?: ReadonlySet<string>
  config?: PricingConfig
  /**
   * True when the caller already shows the free-delivery ladder itself — the
   * basket drawer does. Stops the same fact appearing twice in one view.
   */
  skipDelivery?: boolean
}

/**
 * The one thing worth saying about this basket, or nothing.
 *
 * ONE, deliberately. A stack of suggestions above a basket is a nag, and the
 * second-best thing to say is nearly always worth less than the silence.
 *
 * The order is the point:
 *
 *   1. **An overlap.** The only one that does not want money — "both of these
 *      give you magnesium" usually means buy one, not two. A shop that would
 *      rather sell a bundle than mention it has answered the question of what it
 *      is for, and answered it badly.
 *   2. **A bundle.** A specific, larger and more interesting thought than
 *      "spend more and postage is free".
 *   3. **The delivery ladder**, which is still in the drawer either way.
 */
export function bestNudge({
  resolved, subtotal, bundles, products, dismissed, config, skipDelivery,
}: NudgeInput): BasketNudge | null {
  const isLive = (key: string) => !dismissed?.has(key)

  for (const overlap of activeOverlaps(resolved)) {
    const key = `overlap:${overlap.key}`
    if (!isLive(key)) continue
    return { kind: 'overlap', key, sentence: overlapSentence(overlap), overlap }
  }

  const bundle = bundleNudges(resolved, bundles, products, config).find((n) => isLive(n.key))
  if (bundle) return bundle

  if (skipDelivery) return null
  const delivery = deliveryNudge(subtotal, config)
  return delivery && isLive(delivery.key) ? delivery : null
}
