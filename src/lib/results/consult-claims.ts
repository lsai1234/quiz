/**
 * Which consult needs and Pinpoint patterns an authorised claim can back
 * (Amp Consult and offer plan, Phase 5). The goal-to-claim map
 * (`goal-claims.ts`), extended to the consult's 16 needs and 16 patterns.
 *
 * A product's reason may name a need ("To keep your protein up") or a pattern
 * ("For your 3pm crash") only where this map backs the claim the product's
 * kind carries, and that claim then sits beside it, verbatim. Otherwise the
 * reason is one that isn't about health (an answer restated: "No oily fish
 * most weeks"), or none.
 *
 * NOT LIVE UNTIL SIGNED OFF. Like the goal map, this changes what may be said
 * next to a product, so it has its own sheet (docs/consult-claims-signoff.csv,
 * `npm run claims:signoff`) and its own record below. While the record is
 * null, `needClaimFor` and `patternClaimFor` back nothing: reasons that name a
 * need or a pattern fall back to an answer, and patterns are shown without
 * products. Recording the sign-off turns the map on, with no other change.
 *
 * The rules are the goal map's:
 * - Claim ids come from `CLAIMS_BY_KIND` only, and only ids that kind carries.
 * - A need or pattern is mapped only where the claim's own words cover it.
 *   Where they don't, it maps to nothing (and gets habit fixes, not products).
 * - Held back for the same reasons as the goal map: electrolyte claims (their
 *   condition of use is a carbohydrate-electrolyte solution), and "normal
 *   function" brain and cognitive claims beside a worry about sharpness.
 */

import type { CatalogueProduct, SwapGroup } from '@/lib/catalogue/types'
import { CLAIMS, claimsFor, type Claim } from '@/lib/consult/claims'
import type { NeedId } from '@/lib/consult/knowledge'
import type { PatternId } from '@/lib/consult/pinpoint/types'
import type { GoalClaimLink } from './goal-claims'

const PROTEIN_KINDS: readonly SwapGroup[] = ['protein-whey', 'protein-plant', 'protein-clear', 'protein-mass', 'protein-bar']
const each = (kinds: readonly SwapGroup[], claimIds: readonly string[]): GoalClaimLink[] => kinds.map((kind) => ({ kind, claimIds }))

const TIREDNESS: GoalClaimLink[] = [
  { kind: 'vitamin-b', claimIds: ['b12-tiredness', 'b6-tiredness'] },
  { kind: 'magnesium', claimIds: ['magnesium-tiredness'] },
  { kind: 'vitamin-c', claimIds: ['vitc-tiredness'] },
  { kind: 'zma', claimIds: ['magnesium-tiredness'] },
]
const PROTEIN_ANY = each(PROTEIN_KINDS, ['protein-muscle-growth', 'protein-muscle-maintenance', 'protein-bones'])
const PROTEIN_KEEP = each(PROTEIN_KINDS, ['protein-muscle-maintenance'])
const VITAMIN_D: GoalClaimLink[] = [{ kind: 'vitamin-d', claimIds: ['vitd-bones', 'vitd-muscle', 'vitd-immune'] }]

export const NEED_CLAIMS: Readonly<Record<NeedId, readonly GoalClaimLink[]>> = {
  // Getting enough protein: the register's protein claims, which are about protein.
  protein: PROTEIN_ANY,
  // Keeping or building strength: muscle mass, and creatine's performance claim.
  strength: [...each(PROTEIN_KINDS, ['protein-muscle-maintenance', 'protein-muscle-growth']), { kind: 'creatine', claimIds: ['creatine-performance'] }],
  // Vitamin D from too little daylight: vitamin D's own claims.
  'low-sun': VITAMIN_D,
  // Oily fish: EPA and DHA's heart claim (the brain one is held back, above).
  omega: [{ kind: 'omega-3', claimIds: ['epa-dha-heart'] }],
  // Tiredness: the "reduction of tiredness and fatigue" claims.
  energy: TIREDNESS,
  // B12 on a plant-based plate: B12's claim is about tiredness, which is what running light feels like.
  'b12-iron': [{ kind: 'vitamin-b', claimIds: ['b12-tiredness', 'b6-tiredness'] }],
  immunity: [
    { kind: 'vitamin-d', claimIds: ['vitd-immune'] },
    { kind: 'vitamin-c', claimIds: ['vitc-immune'] },
    { kind: 'zma', claimIds: ['zinc-immune'] },
  ],
  // No authorised claim speaks to these.
  recovery: [],
  hydration: [],
  joints: [],
  collagen: [],
  sleep: [],
  stress: [],
  focus: [],
  basics: [],
  gut: [],
}

export const PATTERN_CLAIMS: Readonly<Record<PatternId, readonly GoalClaimLink[]>> = {
  // Flat by mid-afternoon: tiredness and fatigue.
  crash: TIREDNESS,
  // Protein at one meal, not three: protein's claims.
  'protein-gap': PROTEIN_ANY,
  // Training on not much food, and eating less while flagging: keeping muscle.
  empty: PROTEIN_KEEP,
  'eating-less': PROTEIN_KEEP,
  // Plant-based and active: protein runs light.
  'plant-gap': PROTEIN_ANY,
  // Not much daylight: vitamin D.
  indoor: VITAMIN_D,
  // Stairs and jars getting harder: keeping muscle mass and muscle function.
  'keeping-strong': [...PROTEIN_KEEP, { kind: 'vitamin-d', claimIds: ['vitd-muscle'] }],
  // A supplement shouldn't paper over these: habit fixes only.
  wired: [],
  'short-sleep': [],
  'broken-nights': [],
  'caffeine-train': [],
  'not-recovering': [],
  sweat: [],
  'weekend-warrior': [],
  'stiff-starter': [],
  'staying-sharp': [],
}

/** The sign-off on record for this map, or null: until then it backs nothing. */
export interface ConsultClaimsSignoff {
  date: string
  sha256: string
}
export const CONSULT_CLAIMS_SIGNOFF: ConsultClaimsSignoff | null = null

let preview: boolean | null = null

/**
 * For the sign-off sheet and the reasons report only: what the reasons would
 * be with the map live. Never called by the app.
 */
export function previewConsultClaims(on: boolean | null): void {
  preview = on
}

export function consultClaimsLive(): boolean {
  return preview ?? CONSULT_CLAIMS_SIGNOFF !== null
}

function backed(links: readonly GoalClaimLink[], product: Pick<CatalogueProduct, 'swapGroup'>, live: boolean): Claim | null {
  if (!live) return null
  const carried = claimsFor(product.swapGroup)
  for (const link of links) {
    if (link.kind !== product.swapGroup) continue
    const id = link.claimIds.find((c) => carried.includes(c))
    if (id && CLAIMS[id]) return CLAIMS[id]
  }
  return null
}

/** The claim that lets this need be named beside this product, or null. */
export function needClaimFor(need: NeedId, product: Pick<CatalogueProduct, 'swapGroup'>, live = consultClaimsLive()): Claim | null {
  return backed(NEED_CLAIMS[need] ?? [], product, live)
}

/** The claim that lets this pattern be named beside this product, or null. */
export function patternClaimFor(pattern: PatternId, product: Pick<CatalogueProduct, 'swapGroup'>, live = consultClaimsLive()): Claim | null {
  return backed(PATTERN_CLAIMS[pattern] ?? [], product, live)
}

/** Patterns no product can be linked to: they get habit fixes only. */
export function habitOnlyPatterns(): PatternId[] {
  return (Object.entries(PATTERN_CLAIMS) as Array<[PatternId, readonly GoalClaimLink[]]>).filter(([, links]) => links.length === 0).map(([id]) => id)
}
