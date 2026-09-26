/**
 * Approved claim wording (plan p.11: "Only use claim wording from the GB
 * Nutrition and Health Claims register").
 *
 * Each claim has an ID and the register's exact words, from the authorised
 * health claims retained in GB law from Regulation (EU) 432/2012. A product
 * carries claim IDs by its kind; nothing anywhere composes a health claim
 * of its own, and the AI is forbidden from making any (see `ai/copy.ts`).
 *
 * ── Before launch ───────────────────────────────────────────────────────────
 * A claim may only be used when the product meets its conditions of use (a
 * source of the nutrient, the stated daily amount). Those depend on each
 * product's formula, so every mapping below needs checking against the
 * register and the label by whoever signs off the claims. A kind with no
 * authorised claim — adaptogens, collagen, joint support, probiotics, greens,
 * nootropics, pre-workouts, fat burners — deliberately carries none.
 */

import type { SwapGroup } from '@/lib/catalogue/types'

export interface Claim {
  id: string
  /** The register's wording, verbatim. */
  wording: string
  /** The condition of use, in short. */
  condition: string
}

export const CLAIMS: Record<string, Claim> = {
  'protein-muscle-growth': { id: 'protein-muscle-growth', wording: 'Protein contributes to a growth in muscle mass', condition: 'At least a source of protein' },
  'protein-muscle-maintenance': { id: 'protein-muscle-maintenance', wording: 'Protein contributes to the maintenance of muscle mass', condition: 'At least a source of protein' },
  'protein-bones': { id: 'protein-bones', wording: 'Protein contributes to the maintenance of normal bones', condition: 'At least a source of protein' },
  'creatine-performance': {
    id: 'creatine-performance',
    wording: 'Creatine increases physical performance in successive bursts of short-term, high intensity exercise',
    condition: '3 g of creatine a day',
  },
  'cho-electrolyte-endurance': {
    id: 'cho-electrolyte-endurance',
    wording: 'Carbohydrate-electrolyte solutions contribute to the maintenance of endurance performance during prolonged endurance exercise',
    condition: 'Carbohydrate-electrolyte solution meeting the register’s composition',
  },
  'cho-electrolyte-water': {
    id: 'cho-electrolyte-water',
    wording: 'Carbohydrate-electrolyte solutions enhance the absorption of water during physical exercise',
    condition: 'Carbohydrate-electrolyte solution meeting the register’s composition',
  },
  'epa-dha-heart': { id: 'epa-dha-heart', wording: 'EPA and DHA contribute to the normal function of the heart', condition: '250 mg of EPA and DHA a day' },
  'dha-brain': { id: 'dha-brain', wording: 'DHA contributes to maintenance of normal brain function', condition: '250 mg of DHA a day' },
  'dha-vision': { id: 'dha-vision', wording: 'DHA contributes to the maintenance of normal vision', condition: '250 mg of DHA a day' },
  'vitd-immune': { id: 'vitd-immune', wording: 'Vitamin D contributes to the normal function of the immune system', condition: 'At least a source of vitamin D' },
  'vitd-bones': { id: 'vitd-bones', wording: 'Vitamin D contributes to the maintenance of normal bones', condition: 'At least a source of vitamin D' },
  'vitd-muscle': { id: 'vitd-muscle', wording: 'Vitamin D contributes to the maintenance of normal muscle function', condition: 'At least a source of vitamin D' },
  'b12-tiredness': { id: 'b12-tiredness', wording: 'Vitamin B12 contributes to the reduction of tiredness and fatigue', condition: 'At least a source of vitamin B12' },
  'b6-tiredness': { id: 'b6-tiredness', wording: 'Vitamin B6 contributes to the reduction of tiredness and fatigue', condition: 'At least a source of vitamin B6' },
  'magnesium-tiredness': { id: 'magnesium-tiredness', wording: 'Magnesium contributes to a reduction of tiredness and fatigue', condition: 'At least a source of magnesium' },
  'magnesium-muscle': { id: 'magnesium-muscle', wording: 'Magnesium contributes to normal muscle function', condition: 'At least a source of magnesium' },
  'zinc-immune': { id: 'zinc-immune', wording: 'Zinc contributes to the normal function of the immune system', condition: 'At least a source of zinc' },
  'zinc-cognitive': { id: 'zinc-cognitive', wording: 'Zinc contributes to normal cognitive function', condition: 'At least a source of zinc' },
  'vitc-immune': { id: 'vitc-immune', wording: 'Vitamin C contributes to the normal function of the immune system', condition: 'At least a source of vitamin C' },
  'vitc-tiredness': { id: 'vitc-tiredness', wording: 'Vitamin C contributes to the reduction of tiredness and fatigue', condition: 'At least a source of vitamin C' },
}

/** Claim IDs by kind of product. A kind that isn't listed carries none. */
export const CLAIMS_BY_KIND: Partial<Record<SwapGroup, string[]>> = {
  'protein-whey': ['protein-muscle-growth', 'protein-muscle-maintenance', 'protein-bones'],
  'protein-plant': ['protein-muscle-growth', 'protein-muscle-maintenance', 'protein-bones'],
  'protein-clear': ['protein-muscle-growth', 'protein-muscle-maintenance', 'protein-bones'],
  'protein-mass': ['protein-muscle-growth', 'protein-muscle-maintenance'],
  'protein-bar': ['protein-muscle-growth', 'protein-muscle-maintenance'],
  creatine: ['creatine-performance'],
  electrolytes: ['cho-electrolyte-endurance', 'cho-electrolyte-water'],
  'omega-3': ['epa-dha-heart', 'dha-brain', 'dha-vision'],
  'vitamin-d': ['vitd-immune', 'vitd-bones', 'vitd-muscle'],
  'vitamin-b': ['b12-tiredness', 'b6-tiredness'],
  magnesium: ['magnesium-tiredness', 'magnesium-muscle'],
  zma: ['zinc-immune', 'zinc-cognitive', 'magnesium-tiredness'],
  'vitamin-c': ['vitc-immune', 'vitc-tiredness'],
}

export function claimsFor(group: SwapGroup): string[] {
  return CLAIMS_BY_KIND[group] ?? []
}
