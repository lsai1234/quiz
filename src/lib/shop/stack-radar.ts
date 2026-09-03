import type { CatalogueProduct, StackSlot } from '@/lib/catalogue/types'
import { SLOT_LABELS, STACK_SLOTS } from '@/lib/catalogue/types'
import type { ResolvedBasketLine } from '@/lib/basket/types'

/**
 * Stack Radar: the quiz's structural thinking, applied to a basket.
 *
 * The quiz reasons in `StackSlot`s — protein, performance, hydration, sleep. The
 * shop does not; it is a wall of products, and someone who will never take the
 * quiz gets none of that. This gives the basket the same two readings the engine
 * takes of a stack:
 *
 *   · **Coverage** — which jobs this basket covers, and which it does not.
 *   · **Overlap** — the same active ingredient arriving twice.
 *
 * ── Coverage is a map, not a recommendation ──────────────────────────────────
 * It reports which slots the basket fills and which are empty. It does NOT say
 * an empty slot is a gap the shopper should close: nobody needs all ten, we know
 * nothing about their goals here, and "you are missing hydration" is a sales
 * pitch dressed as analysis. Listing what is and is not covered is a fact;
 * ranking what they ought to add is the quiz's job, and the quiz asks first.
 *
 * ── Overlap is the part worth building ───────────────────────────────────────
 * Reading `actives` across a basket lets the shop say "both of these give you
 * magnesium" — which usually means buy one, not two. Telling someone to spend
 * less is the most trust-building thing a supplement shop can do, and we are one
 * of very few that hold the ingredient data to do it.
 *
 * It stays arithmetic, never advice: what is in the basket and what the labels
 * add up to. No dose is called too much, nothing is called unsafe, and nobody is
 * told to stop — those are claims, and this module does not make claims.
 */

export interface SlotCoverage {
  slot: StackSlot
  label: string
  /** Basket products filling this slot. */
  products: CatalogueProduct[]
  covered: boolean
  /** How many products the shop sells for this slot. */
  available: number
}

export interface ActiveOverlap {
  /** Normalised ingredient key, as stored on the product. */
  key: string
  label: string
  /** The basket products that both carry it, in basket order. */
  products: CatalogueProduct[]
  /**
   * Combined milligrams across those products, or null when any of them does not
   * state a dose. A partial total would be a smaller number than the truth,
   * which is the one direction this must never round.
   */
  totalMg: number | null
}

/** 'beta-alanine' → 'Beta Alanine'; 'vitamin-c' → 'Vitamin C'. */
export function activeLabel(key: string): string {
  return key
    .replace(/[-_]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * What this basket covers, slot by slot.
 *
 * Only slots the catalogue actually sells for are returned — an empty slot with
 * nothing behind it is a dead end, not information. Covered slots come first, so
 * the reading is "here is what you have" before "here is what you have not".
 */
export function slotCoverage(
  resolved: ResolvedBasketLine[],
  products: CatalogueProduct[],
): SlotCoverage[] {
  const inBasket = resolved.map((line) => line.product)

  const rows: SlotCoverage[] = []
  for (const slot of STACK_SLOTS) {
    const available = products.filter((p) => p.stackSlots.includes(slot)).length
    if (available === 0) continue
    const filling = inBasket.filter((p) => p.stackSlots.includes(slot))
    rows.push({
      slot,
      label: SLOT_LABELS[slot],
      products: filling,
      covered: filling.length > 0,
      available,
    })
  }

  return rows.sort((a, b) => Number(b.covered) - Number(a.covered))
}

/**
 * Active ingredients arriving from more than one product in the basket.
 *
 * Compared on the stored key rather than the display label, and counted per
 * PRODUCT rather than per line — two tubs of the same magnesium is a quantity
 * someone chose, not a duplication they missed.
 */
export function activeOverlaps(resolved: ResolvedBasketLine[]): ActiveOverlap[] {
  const seen = new Map<string, CatalogueProduct[]>()
  const doses = new Map<string, Array<number | undefined>>()

  const products: CatalogueProduct[] = []
  for (const line of resolved) {
    if (!products.some((p) => p.id === line.product.id)) products.push(line.product)
  }

  for (const product of products) {
    // A product listing the same active twice is a data slip, not an overlap.
    const keys = new Set<string>()
    for (const active of product.actives ?? []) {
      const key = active.name.trim().toLowerCase()
      if (!key || keys.has(key)) continue
      keys.add(key)
      seen.set(key, [...(seen.get(key) ?? []), product])
      doses.set(key, [...(doses.get(key) ?? []), active.mg])
    }
  }

  const overlaps: ActiveOverlap[] = []
  for (const [key, involved] of seen) {
    if (involved.length < 2) continue
    const mg = doses.get(key) ?? []
    const complete = mg.length === involved.length && mg.every((v) => typeof v === 'number' && v > 0)
    overlaps.push({
      key,
      label: activeLabel(key),
      products: involved,
      totalMg: complete ? (mg as number[]).reduce((sum, v) => sum + v, 0) : null,
    })
  }

  // Most-duplicated first, then the biggest known total — the clearest case to
  // act on leads.
  return overlaps.sort((a, b) => {
    if (a.products.length !== b.products.length) return b.products.length - a.products.length
    return (b.totalMg ?? 0) - (a.totalMg ?? 0)
  })
}

/** A dose in the unit a person would say out loud. */
export function formatDoseMg(mg: number): string {
  if (mg >= 1000) return `${Math.round(mg / 100) / 10}g`
  return `${mg}mg`
}

/**
 * The overlap, in one sentence of plain arithmetic.
 *
 * Deliberately says only what is in the basket and what the labels add up to.
 * It does not say the total is too much, that anything is unsafe, or that they
 * should remove one — every one of those is a claim, and this is a shop.
 */
export function overlapSentence(overlap: ActiveOverlap): string {
  const names = overlap.products.map((p) => p.shortName || p.title)
  const total = overlap.totalMg === null ? '' : ` — ${formatDoseMg(overlap.totalMg)} in total`
  const subject =
    names.length === 2
      ? `${names[0]} and ${names[1]} both contain`
      : `${names.length} of your products contain`
  return `${subject} ${overlap.label.toLowerCase()}${total}.`
}
