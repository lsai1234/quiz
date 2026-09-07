import type { CatalogueProduct } from '@/lib/catalogue/types'

/**
 * Is this shop stock rather than a supplement?
 *
 * ── Why the shop has to ask ─────────────────────────────────────────────────
 * A shaker has no dose, so it has no servings, no per-serving price, no onset
 * ("you'll feel it within a few weeks") and nothing to subscribe to. Every one
 * of those is a fact the product card and the product sheet print by default,
 * and the import gives an accessory the same defaults a tub gets — which is how
 * three shakers came to advertise "30 servings", "30 servings" and "1 servings"
 * on the same shelf.
 *
 * It is one unit. That is the whole specification.
 *
 * ── Two signals, because the data has two shapes ────────────────────────────
 * `swapGroup` is the answer when the classifier saw the word "shaker" and filed
 * it (see `supplier/mapping`), and it is the one the roster CSV sets by hand.
 * But plenty of accessories were imported before that rule existed, or came in
 * under a name it does not match, and they sit in `general` with PowerBody's own
 * "Accessories" category on them. Reading the category too means this is right
 * about products already in the shop, not only about the next import — a display
 * rule that needs a backfill to take effect is not much of a rule.
 *
 * Deliberately narrow on the category: `/accessor/` matches PowerBody's
 * "Accessories" and "Gym Accessories" and nothing else in their taxonomy.
 */
export function isAccessory(product: Pick<CatalogueProduct, 'swapGroup' | 'category'>): boolean {
  return product.swapGroup === 'accessory' || /accessor/i.test(product.category ?? '')
}

/**
 * A serving count, written the way a person would.
 *
 * Rounded, because a scaled variant count is a fraction ("29.8 servings" is not
 * something anybody prints), and singular at one — the "1 servings" on a shaker
 * card was two bugs in three words.
 */
export function servingsLabel(count: number): string {
  const n = Math.max(1, Math.round(count))
  return `${n} serving${n === 1 ? '' : 's'}`
}
