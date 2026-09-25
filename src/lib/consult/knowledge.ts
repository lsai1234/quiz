/**
 * The stack engine's knowledge base (build H4).
 *
 * The engine doesn't know products by name. It knows what each *kind* of
 * product does — which needs it meets, how well, and what's in it that a rule
 * might have to keep out — and every catalogue product is a kind by its
 * `swapGroup`. That keeps the knowledge small enough to be reviewed by a
 * pharmacist in one sitting, and it means a product added from PowerBody
 * tomorrow is scored the day it lands.
 *
 * Titles are read too, for the ingredients a group doesn't settle on its own:
 * a vitamin D with K2 (blood thinners), an algae omega-3 (no fish oil), a
 * nootropic with caffeine in it.
 */

import type { CatalogueProduct, SwapGroup } from '@/lib/catalogue/types'
import type { Ingredient } from './circuit'
import type { ConsultGoal, ShelfItem } from './types'

export type NeedId =
  | 'protein'
  | 'strength'
  | 'recovery'
  | 'hydration'
  | 'joints'
  | 'collagen'
  | 'low-sun'
  | 'omega'
  | 'sleep'
  | 'stress'
  | 'energy'
  | 'focus'
  | 'basics'
  | 'b12-iron'
  | 'gut'
  | 'immunity'

export const NEEDS: NeedId[] = [
  'protein', 'strength', 'recovery', 'hydration', 'joints', 'collagen', 'low-sun', 'omega',
  'sleep', 'stress', 'energy', 'focus', 'basics', 'b12-iron', 'gut', 'immunity',
]

interface Kind {
  /** How well this kind meets each need, 0–1. */
  meets: Partial<Record<NeedId, number>>
  /** What's in every product of this kind, for the exclusion rules. */
  contains?: Ingredient[]
  /**
   * Kinds that count as one for duplicates and doses: two proteins, two
   * pre-workouts or two magnesiums in one stack is a double dose, not a
   * better stack.
   */
  family?: string
}

export const KINDS: Partial<Record<SwapGroup, Kind>> = {
  'protein-whey': { meets: { protein: 1 }, family: 'protein' },
  'protein-plant': { meets: { protein: 1 }, family: 'protein' },
  'protein-clear': { meets: { protein: 0.85 }, family: 'protein' },
  'protein-mass': { meets: { protein: 0.5 }, family: 'protein' },
  'protein-bar': { meets: { protein: 0.3 }, family: 'protein' },
  creatine: { meets: { strength: 1 } },
  'pre-workout-stim': { meets: { energy: 0.6, strength: 0.3 }, contains: ['caffeine', 'stimulant'], family: 'pre-workout' },
  'pre-workout-stim-free': { meets: { strength: 0.35, energy: 0.2 }, family: 'pre-workout' },
  aminos: { meets: { recovery: 0.5, hydration: 0.3 } },
  electrolytes: { meets: { hydration: 1 } },
  'omega-3': { meets: { omega: 1, joints: 0.3, focus: 0.3 }, contains: ['fish-oil'] },
  'vitamin-d': { meets: { 'low-sun': 1 } },
  multivitamin: { meets: { basics: 1, 'b12-iron': 0.6, energy: 0.2 } },
  'vitamin-b': { meets: { energy: 0.6, 'b12-iron': 0.8 } },
  magnesium: { meets: { sleep: 0.7, stress: 0.4, recovery: 0.3 }, family: 'magnesium' },
  zma: { meets: { sleep: 0.5, recovery: 0.4 }, family: 'magnesium' },
  // Sleep blends commonly carry ashwagandha, so a blend and an adaptogen
  // together is a double dose of it: one family.
  'sleep-support': { meets: { sleep: 1, stress: 0.4 }, family: 'calm-blend' },
  adaptogen: { meets: { stress: 1, energy: 0.3, sleep: 0.2 }, family: 'calm-blend' },
  collagen: { meets: { collagen: 1, joints: 0.6 } },
  'joint-support': { meets: { joints: 1 } },
  'vitamin-c': { meets: { immunity: 1 } },
  probiotic: { meets: { gut: 1, immunity: 0.2 } },
  greens: { meets: { gut: 0.5, basics: 0.4 } },
  fibre: { meets: { gut: 0.7 } },
  nootropic: { meets: { focus: 1, energy: 0.3 } },
  'energy-gel': { meets: { hydration: 0.3, energy: 0.3 } },
  menopause: { meets: {}, contains: ['hormone-active'] },
  // Never recommended by the consult: nothing it asks about calls for them.
  'fat-burner': { meets: {}, contains: ['caffeine', 'stimulant'] },
  accessory: { meets: {} },
  general: { meets: {} },
}

/** Ingredients a title gives away that its group doesn't. */
const TITLE_INGREDIENTS: [RegExp, Ingredient][] = [
  [/\bk2\b|vitamin k\b/i, 'vitamin-k'],
  [/caffeine|guarana|pre-?workout|energy shot/i, 'caffeine'],
  [/ginkgo/i, 'ginkgo'],
  [/turmeric|curcumin/i, 'turmeric'],
  [/st\.? john/i, 'st-johns-wort'],
  [/krill|glucosamine|chitosan|shellfish/i, 'shellfish'],
  [/fish oil|cod liver|krill/i, 'fish-oil'],
]

/** Titles that clear an ingredient the group would otherwise imply. */
const TITLE_CLEARS: [RegExp, Ingredient][] = [
  [/algae|algal|vegan omega/i, 'fish-oil'],
  [/stim-?free|caffeine-?free|non-?stim/i, 'caffeine'],
  [/stim-?free|caffeine-?free|non-?stim/i, 'stimulant'],
]

export function kindOf(p: Pick<CatalogueProduct, 'swapGroup'>): Kind | undefined {
  return KINDS[p.swapGroup]
}

export function familyOf(p: Pick<CatalogueProduct, 'swapGroup'>): string {
  return kindOf(p)?.family ?? p.swapGroup
}

/** Everything the rules need to know is in a product. */
export function ingredientsOf(p: Pick<CatalogueProduct, 'swapGroup' | 'title' | 'contraindications'>): Set<Ingredient> {
  const out = new Set<Ingredient>(kindOf(p)?.contains ?? [])
  for (const [re, i] of TITLE_INGREDIENTS) if (re.test(p.title)) out.add(i)
  for (const [re, i] of TITLE_CLEARS) if (re.test(p.title)) out.delete(i)
  if (p.contraindications?.includes('shellfish')) out.add('shellfish')
  if (p.contraindications?.includes('medication')) out.add('rx-interaction')
  return out
}

/**
 * What each goal asks of the stack, before the answers refine it. Scaled so a
 * goal and an answer carry comparable weight: the top goal's main need comes
 * to 6 (2 × 3), which "hardly ever" daylight (4) can sit alongside rather than
 * be drowned by. Answers are what make two people with the same goals get
 * different stacks.
 */
export const GOAL_NEEDS: Record<ConsultGoal, Partial<Record<NeedId, number>>> = {
  performance: { protein: 2, strength: 2, recovery: 1, hydration: 0.5 },
  energy: { energy: 2, basics: 1.25, 'b12-iron': 0.5, sleep: 0.5 },
  sleep: { sleep: 2, stress: 1.25, recovery: 0.5 },
  focus: { focus: 2, omega: 1.25, stress: 0.5, sleep: 0.5 },
  ageing: { joints: 2, collagen: 1.25, omega: 1.25, 'low-sun': 1.25, basics: 0.5 },
  allround: { basics: 2, omega: 1.25, 'low-sun': 0.5, gut: 0.5, immunity: 0.5 },
}

/** Goal 1 counts ×3, goal 2 ×2, goal 3 ×1. */
export const GOAL_WEIGHT = [3, 2, 1]

/** What each shelf item already covers: those swap groups are skipped. */
export const SHELF_COVERS: Record<ShelfItem, SwapGroup[]> = {
  multivitamin: ['multivitamin'],
  'vitamin-d': ['vitamin-d'],
  creatine: ['creatine'],
  protein: ['protein-whey', 'protein-plant', 'protein-clear', 'protein-mass'],
  'omega-3': ['omega-3'],
  'pre-workout': ['pre-workout-stim', 'pre-workout-stim-free'],
  magnesium: ['magnesium', 'zma'],
  collagen: ['collagen'],
}

/** A stimulant on the shelf is the day's caffeine source already. */
export const SHELF_CAFFEINE: ShelfItem[] = ['pre-workout']
