import type { CatalogueProduct } from '@/lib/catalogue/types'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { effectOnsetForProduct, onsetWindowLabel } from '@/lib/feedback'
import { productDietary, formatFact } from '@/lib/product-facts'
import { hasRating, formatRatingCount } from './ratings'
import { defaultVariant } from './merchandising'
import { pricePerServing, servingsForVariant, formatPerServing } from './per-serving'

/**
 * The Shelf Duel: two products, row by row.
 *
 * `ShopSection` already computes shared stat axes per category and its own
 * comment says the cards "compare like top-trumps". This makes that literal.
 *
 * ── Two rules the whole thing rests on ───────────────────────────────────────
 *
 * 1. **A row only has a winner where "better" is a fact.** Cheaper per serving
 *    is a fact. More servings is a fact. In stock is a fact. Powder versus
 *    capsules is a preference, and lighting one up would be inventing a verdict
 *    the data does not support — so those rows carry both values and no crown.
 *
 * 2. **The loser is never disparaged — but a consolation has to be TRUE.** A
 *    scored row may carry a `note` written from the LOSING column's side and
 *    rendered under it. "Costs less up front" only appears where the loser
 *    genuinely is cheaper; "may go further per serving" only where it genuinely
 *    does. When one product simply wins on the money — cheaper AND cheaper per
 *    serving — there is no consolation, and silence is the honest answer.
 *    Boilerplate reassurance is how a comparison starts lying.
 *
 * Both products are compared at their DEFAULT variant — the one the shelf card
 * prices — so the sheet never quietly compares a 2kg tub against a 300g one.
 */

/** A duel is two products. Three columns on a phone is a spreadsheet. */
export const MAX_DUEL_PRODUCTS = 2

export type DuelDirection = 'lower-wins' | 'higher-wins' | 'none'

export interface DuelCell {
  /** What to show. Null renders as an em dash: we do not know. */
  text: string | null
  /** The comparable number behind it, when there is one. */
  value: number | null
}

export interface DuelRow {
  key: string
  label: string
  cells: [DuelCell, DuelCell]
  /** Index of the better column, or null for a tie, a draw, or a preference. */
  winner: 0 | 1 | null
  /**
   * What the LOSING column is still better for, shown under it. Only set when
   * there is a winner to lose to.
   */
  note?: string
}

export interface Duel {
  products: [CatalogueProduct, CatalogueProduct]
  rows: DuelRow[]
  /** The variant each column is priced at, for the sheet's subheading. */
  variantLabels: [string | null, string | null]
}

/** Decide the winner from two comparable numbers. A tie has no winner. */
function pick(a: number | null, b: number | null, direction: DuelDirection): 0 | 1 | null {
  if (direction === 'none' || a === null || b === null || a === b) return null
  const aWins = direction === 'lower-wins' ? a < b : a > b
  return aWins ? 0 : 1
}

const cell = (text: string | null, value: number | null = null): DuelCell => ({ text, value })

/** Is the column that LOST on per-serving actually the cheaper purchase? */
function cheaperUpFront(perServingWinner: 0 | 1 | null, priceA: number, priceB: number): boolean {
  if (perServingWinner === null) return false
  const loserPrice = perServingWinner === 0 ? priceB : priceA
  const winnerPrice = perServingWinner === 0 ? priceA : priceB
  return loserPrice < winnerPrice
}

/** Does the column that LOST on price actually go further per serving? */
function betterPerServing(priceWinner: 0 | 1 | null, psA: number | null, psB: number | null): boolean {
  if (priceWinner === null || psA === null || psB === null) return false
  const loser = priceWinner === 0 ? psB : psA
  const winner = priceWinner === 0 ? psA : psB
  return loser < winner
}

function variantLabel(product: CatalogueProduct): string | null {
  const v = defaultVariant(product)
  if (!v) return null
  const parts = [v.flavour, v.size].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : v.title
}

/**
 * Build the comparison.
 *
 * Order is deliberate: value first, because that is the question the sheet
 * exists to answer, then the facts that qualify it, then the preferences.
 */
export function buildDuel(a: CatalogueProduct, b: CatalogueProduct): Duel {
  const rows: DuelRow[] = []
  const va = defaultVariant(a)
  const vb = defaultVariant(b)

  // Both money rows are decided up front, because each one's consolation note
  // depends on the OTHER's result — see rule 2.
  const psA = va ? pricePerServing(a, va) : null
  const psB = vb ? pricePerServing(b, vb) : null
  const priceA = va?.price ?? a.basePrice
  const priceB = vb?.price ?? b.basePrice
  const perServingWinner = pick(psA, psB, 'lower-wins')
  const priceWinner = pick(priceA, priceB, 'lower-wins')

  // ── Price per serving — the headline ─────────────────────────────────────
  rows.push({
    key: 'per-serving',
    label: 'Price per serving',
    cells: [
      cell(psA === null ? null : formatPerServing(psA), psA),
      cell(psB === null ? null : formatPerServing(psB), psB),
    ],
    winner: perServingWinner,
    // Only where the loser really is the cheaper purchase — usually the smaller
    // tub, but not when one product is better on both counts.
    note: cheaperUpFront(perServingWinner, priceA, priceB) ? 'Costs less up front.' : undefined,
  })

  rows.push({
    key: 'price',
    label: 'Price',
    cells: [cell(formatGBP(priceA), priceA), cell(formatGBP(priceB), priceB)],
    winner: priceWinner,
    // Only where the dearer one really does go further per serving.
    note: betterPerServing(priceWinner, psA, psB) ? 'May go further per serving.' : undefined,
  })

  // ── Servings ─────────────────────────────────────────────────────────────
  const sA = va ? servingsForVariant(a, va) : null
  const sB = vb ? servingsForVariant(b, vb) : null
  rows.push({
    key: 'servings',
    label: 'Servings',
    cells: [
      cell(sA === null ? null : `${Math.round(sA)}`, sA),
      cell(sB === null ? null : `${Math.round(sB)}`, sB),
    ],
    winner: pick(sA, sB, 'higher-wins'),
    note: sA !== null && sB !== null && sA !== sB ? 'A smaller commitment.' : undefined,
  })

  // ── Rating ───────────────────────────────────────────────────────────────
  const rA = hasRating(a.rating) ? a.rating.average : null
  const rB = hasRating(b.rating) ? b.rating.average : null
  rows.push({
    key: 'rating',
    label: 'Rating',
    cells: [
      cell(rA === null ? null : `${rA.toFixed(1)} (${formatRatingCount(a.rating!.count)})`, rA),
      cell(rB === null ? null : `${rB.toFixed(1)} (${formatRatingCount(b.rating!.count)})`, rB),
    ],
    winner: pick(rA, rB, 'higher-wins'),
  })

  // ── Availability ─────────────────────────────────────────────────────────
  const stockA = a.variants.some((v) => v.available)
  const stockB = b.variants.some((v) => v.available)
  rows.push({
    key: 'stock',
    label: 'Availability',
    cells: [
      cell(stockA ? 'In stock' : 'Sold out', stockA ? 1 : 0),
      cell(stockB ? 'In stock' : 'Sold out', stockB ? 1 : 0),
    ],
    winner: pick(stockA ? 1 : 0, stockB ? 1 : 0, 'higher-wins'),
  })

  // ── Preferences: shown, never scored ─────────────────────────────────────
  rows.push({
    key: 'format',
    label: 'Format',
    cells: [cell(formatFact(a.formats).label), cell(formatFact(b.formats).label)],
    winner: null,
  })

  rows.push({
    key: 'dietary',
    label: 'Dietary',
    cells: [
      cell(productDietary(a).join(' · ') || null),
      cell(productDietary(b).join(' · ') || null),
    ],
    winner: null,
  })

  rows.push({
    key: 'onset',
    label: "You'll feel it",
    cells: [
      cell(onsetWindowLabel(effectOnsetForProduct(a))),
      cell(onsetWindowLabel(effectOnsetForProduct(b))),
    ],
    winner: null,
  })

  rows.push({
    key: 'actives',
    label: 'Key actives',
    cells: [cell(activesLabel(a)), cell(activesLabel(b))],
    winner: null,
  })

  return { products: [a, b], rows, variantLabels: [variantLabel(a), variantLabel(b)] }
}

/** The named actives with their doses, or null when none are recorded. */
function activesLabel(product: CatalogueProduct): string | null {
  const actives = product.actives ?? []
  if (actives.length === 0) return null
  return actives
    .slice(0, 3)
    .map((active) => (active.mg ? `${active.name} ${formatDose(active.mg)}` : active.name))
    .join(' · ')
}

/** Milligram doses read better in grams once they pass a gram. */
function formatDose(mg: number): string {
  if (mg >= 1000) return `${Math.round(mg / 100) / 10}g`
  return `${mg}mg`
}

/** How many rows actually separate the two products. */
export function decisiveRowCount(duel: Duel): number {
  return duel.rows.filter((row) => row.winner !== null).length
}
