/**
 * Which quiz goals an authorised claim can back.
 *
 * PENDING SIGN-OFF. This map is the only route by which the results page may
 * put a health goal next to a product. "You said you want more energy" beside
 * a product says the product is for energy, which is a health claim, so it is
 * only said where a claim on the GB register says it first, verbatim, right
 * beside it. Nothing here goes live until the person who signs off claims has
 * checked it; `npm run claims:signoff` writes the sheet they check
 * (docs/claims-signoff.csv).
 *
 * The rules this follows:
 * - Claim ids come from `CLAIMS_BY_KIND` (consult/claims.ts) only, and only
 *   the ids that kind already carries. Never from `APPROVED_CLAIMS`, which is
 *   paraphrase.
 * - A goal is mapped only where the claim's own words cover it. Where they
 *   don't, the goal maps to nothing and the page says nothing about it.
 * - General health pairs with any authorised claim, because the claim sits
 *   right beside it and says exactly what is meant.
 * - Within a link, claim ids are in the order to show them: the first one the
 *   product's kind carries is the one shown.
 */

import type { Goal } from '@/lib/types'
import type { CatalogueProduct, SwapGroup } from '@/lib/catalogue/types'
import { CLAIMS, claimsFor, type Claim } from '@/lib/consult/claims'

/** One kind of product, and the claims of that kind that can back a goal. */
export interface GoalClaimLink {
  kind: SwapGroup
  claimIds: readonly string[]
}

/**
 * "Any authorised claim the product carries". Used for General health only.
 * `prefer` picks which claim to show where a kind carries several: a protein's
 * bones claim reads closer to "feel healthier" than its muscle-growth one.
 * Every other kind shows its first claim.
 */
export interface AnyClaim {
  readonly any: true
  readonly prefer: readonly string[]
}

export const ANY_CLAIM: AnyClaim = { any: true, prefer: ['protein-bones'] }

export type GoalClaimEntry = readonly GoalClaimLink[] | AnyClaim

export function isAnyClaim(entry: GoalClaimEntry): entry is AnyClaim {
  return !Array.isArray(entry) && (entry as AnyClaim).any === true
}

const PROTEIN_KINDS: readonly SwapGroup[] = ['protein-whey', 'protein-plant', 'protein-clear', 'protein-mass', 'protein-bar']

const each = (kinds: readonly SwapGroup[], claimIds: readonly string[]): GoalClaimLink[] =>
  kinds.map((kind) => ({ kind, claimIds }))

export const GOAL_CLAIMS: Readonly<Record<Goal, GoalClaimEntry>> = {
  // "Build muscle". Protein: "contributes to a growth in muscle mass" is the
  // goal in the register's words. Creatine: its performance claim is about
  // short, high-intensity bursts, which is how muscle is trained. The weaker
  // of the two links; listed because the plan names it.
  muscle: [
    ...each(PROTEIN_KINDS, ['protein-muscle-growth']),
    { kind: 'creatine', claimIds: ['creatine-performance'] },
  ],
  // "Gain mass". Protein's "growth in muscle mass" only.
  bulking: each(PROTEIN_KINDS, ['protein-muscle-growth']),
  // "Peak performance". Both claims are about physical performance.
  performance: [
    { kind: 'creatine', claimIds: ['creatine-performance'] },
    { kind: 'electrolytes', claimIds: ['cho-electrolyte-endurance'] },
  ],
  // "Stay hydrated". The water-absorption claim (during exercise).
  hydration: [
    { kind: 'electrolytes', claimIds: ['cho-electrolyte-water'] },
  ],
  // "More energy". The "reduction of tiredness and fatigue" claims.
  energy: [
    { kind: 'vitamin-b', claimIds: ['b12-tiredness', 'b6-tiredness'] },
    { kind: 'magnesium', claimIds: ['magnesium-tiredness'] },
    { kind: 'vitamin-c', claimIds: ['vitc-tiredness'] },
    { kind: 'zma', claimIds: ['magnesium-tiredness'] },
  ],
  // "Immune support". The "normal function of the immune system" claims.
  immune: [
    { kind: 'vitamin-d', claimIds: ['vitd-immune'] },
    { kind: 'vitamin-c', claimIds: ['vitc-immune'] },
    { kind: 'zma', claimIds: ['zinc-immune'] },
  ],
  // "Focus & brain fog". Normal brain and cognitive function. The loosest fit
  // in the map: the claims are about normal function, not improving it.
  focus: [
    { kind: 'omega-3', claimIds: ['dha-brain'] },
    { kind: 'zma', claimIds: ['zinc-cognitive'] },
  ],
  // "General health" / "Feel healthier": any authorised claim, shown beside it.
  health: ANY_CLAIM,

  // No authorised claim speaks to these, so they map to nothing.
  recovery: [],
  cutting: [],
  'sleep-better': [],
  'less-stress': [],
  'skin-hair-nails': [],
  'gut-health': [],
  menopause: [],
}

/**
 * The claim that lets this goal be said next to this product, or null when
 * the map has none. The claim is the register's entry itself (verbatim
 * wording), and always one the product's kind carries.
 */
export function goalClaimFor(goal: Goal, product: Pick<CatalogueProduct, 'swapGroup'>): Claim | null {
  const carried = claimsFor(product.swapGroup)
  if (carried.length === 0) return null
  const entry = GOAL_CLAIMS[goal]
  if (!entry) return null
  if (isAnyClaim(entry)) {
    const id = entry.prefer.find((p) => carried.includes(p)) ?? carried[0]
    return CLAIMS[id] ?? null
  }
  for (const link of entry) {
    if (link.kind !== product.swapGroup) continue
    const id = link.claimIds.find((c) => carried.includes(c))
    if (id && CLAIMS[id]) return CLAIMS[id]
  }
  return null
}

/**
 * The one claim to show on a product's card: the claim backing the first of
 * the person's goals that the map links to this product, else the kind's first
 * claim, else null (the kind carries none). Pass goals in the order they
 * should win, primary goal first.
 */
export function productClaim(product: Pick<CatalogueProduct, 'swapGroup'>, goals: readonly Goal[]): Claim | null {
  for (const goal of goals) {
    const claim = goalClaimFor(goal, product)
    if (claim) return claim
  }
  const first = claimsFor(product.swapGroup)[0]
  return (first && CLAIMS[first]) || null
}

/**
 * The goals the map links to one claim of one kind, in `GOAL_CLAIMS` order.
 * General health is left out (it pairs with every claim); callers say so.
 */
export function goalsBackedBy(kind: SwapGroup, claimId: string): Goal[] {
  const out: Goal[] = []
  for (const [goal, entry] of Object.entries(GOAL_CLAIMS) as Array<[Goal, GoalClaimEntry]>) {
    if (isAnyClaim(entry)) continue
    if (entry.some((link) => link.kind === kind && link.claimIds.includes(claimId))) out.push(goal)
  }
  return out
}
