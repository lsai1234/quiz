import type { StackBlueprint } from './stack-blueprint'
import type { CatalogueProduct } from './catalogue/types'
import type { Goal } from './types'

/**
 * Top-trumps stat model for the stack deck. Every product card in the deck is
 * scored on the SAME set of axes — the user's own goals — so the cards invite
 * comparison ("what is each supplement actually for?"). Scores are derived
 * deterministically from existing catalogue signals (a product's goals + its
 * recommendation priority); there is no AI call and no authored per-product
 * stat data. If merchandisers later want to hand-tune bars, this is the one
 * place an override would slot in.
 *
 * COMPLIANCE: bars express strength-of-fit — what a product *targets/supports*
 * — never a promised or quantified result. Keep all surfacing copy claim-safe
 * (see approved-claims.ts): "supports", not "improves by".
 */

export interface StatAxis {
  goal: Goal
  label: string
}

/** Short axis labels — kept punchy for narrow bars. */
const GOAL_LABELS: Record<Goal, string> = {
  muscle: 'Muscle',
  energy: 'Energy',
  performance: 'Performance',
  hydration: 'Hydration',
  recovery: 'Recovery',
  health: 'Health',
  cutting: 'Lean',
  bulking: 'Size',
  'sleep-better': 'Sleep',
  'less-stress': 'Calm',
  focus: 'Focus',
  immune: 'Immunity',
  'skin-hair-nails': 'Skin & Hair',
  menopause: 'Balance',
  'gut-health': 'Gut',
}

/** Sensible fallbacks when a stack is too small to fill the axes from its goals. */
const DEFAULT_PAD_GOALS: Goal[] = ['muscle', 'energy', 'recovery', 'health']

const NON_TARGET_SCORE = 2
export const MAX_STAT = 10

function axisLabel(goal: Goal): string {
  return GOAL_LABELS[goal] ?? goal.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** A goal as a labelled stat axis. */
export function goalAxis(goal: Goal): StatAxis {
  return { goal, label: axisLabel(goal) }
}

/**
 * The stat axes shared by every card in the deck: the user's primary goal
 * (always first), then their secondary goals, padded to `count` by the goals
 * the stack's own products most cover, then by defaults. The axes depend only
 * on the blueprint + stack, never on the card being rendered, so all cards
 * compare on the same footing.
 */
export function selectStatAxes(blueprint: StackBlueprint, products: CatalogueProduct[], count = 4): StatAxis[] {
  const chosen: Goal[] = []
  const add = (g: Goal | undefined) => { if (g && !chosen.includes(g)) chosen.push(g) }

  add(blueprint.primaryGoal)
  blueprint.secondaryGoals.forEach(add)

  if (chosen.length < count) {
    const freq = new Map<Goal, number>()
    for (const slot of blueprint.slots) {
      const p = products.find((pp) => pp.id === slot.selectedProductId)
      p?.goals.forEach((g) => freq.set(g, (freq.get(g) ?? 0) + 1))
    }
    ;[...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([g]) => { if (chosen.length < count) add(g) })
  }

  DEFAULT_PAD_GOALS.forEach((g) => { if (chosen.length < count) add(g) })

  return chosen.slice(0, count).map(goalAxis)
}

/**
 * The shared stat axes for a set of products with no quiz context (a shop
 * category section): the goals those products most cover, so swiping the
 * section's cards compares them on the same footing — the shop analogue of
 * `selectStatAxes`. Padded with defaults when a section is small.
 */
export function selectShopAxes(products: CatalogueProduct[], count = 4): StatAxis[] {
  const freq = new Map<Goal, number>()
  for (const p of products) for (const g of p.goals) freq.set(g, (freq.get(g) ?? 0) + 1)
  const chosen: Goal[] = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g)
  for (const g of DEFAULT_PAD_GOALS) if (!chosen.includes(g)) chosen.push(g)
  return chosen.slice(0, count).map(goalAxis)
}

/**
 * How strongly a single product targets a goal, 0–10. A product that doesn't
 * list the goal contributes a low baseline (it's simply not what it's for); a
 * product that does scales by where the goal sits in its list (its headline
 * goal is strongest) and by its recommendation priority.
 */
export function productStatScore(product: CatalogueProduct, goal: Goal): number {
  const idx = product.goals.indexOf(goal)
  if (idx === -1) return NON_TARGET_SCORE
  const base = idx === 0 ? 9 : idx === 1 ? 7 : 6
  const score = base + (product.recommendationPriority - 7) * 0.3
  return Math.max(5, Math.min(MAX_STAT, Math.round(score * 10) / 10))
}

/** One rendered stat bar: an axis plus this product's score and whether it's a targeted (lit) goal. */
export interface StatBar extends StatAxis {
  score: number
  targeted: boolean
}

/**
 * Score a product against a shared axis set — the data a top-trumps card
 * renders. Bars on goals the product targets are `targeted` (lit); the rest
 * sit as faint context. Shared by the quiz stack cards and the shop cards.
 */
export function productBars(product: CatalogueProduct, axes: StatAxis[]): StatBar[] {
  return axes.map((a) => ({
    ...a,
    score: productStatScore(product, a.goal),
    targeted: product.goals.includes(a.goal),
  }))
}

/**
 * How well the whole stack covers a goal, 0–10, with diminishing returns so a
 * second product on the same axis adds less than the first. Used for stack-level
 * summaries rather than the per-product cards.
 */
export function stackStatScore(products: CatalogueProduct[], goal: Goal): number {
  const sorted = products.map((p) => productStatScore(p, goal)).sort((a, b) => b - a)
  let total = 0
  let weight = 1
  for (const s of sorted) {
    total += s * weight
    weight *= 0.35
  }
  return Math.min(MAX_STAT, Math.round(total * 10) / 10)
}
