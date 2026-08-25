import type { SwapGroup } from '@/lib/catalogue/types'

// Grounding claims the AI copywriter is allowed to draw on per product type.
// Each phrase is a structure/function style statement (no disease claims, no
// guarantees) so generated copy stays advertising-compliant even when the
// model is writing freely. The AI is told to use these as its factual basis,
// not to invent new mechanisms or outcomes.
export const APPROVED_CLAIMS: Record<SwapGroup, string[]> = {
  'protein-whey': [
    'contributes to the growth and maintenance of muscle mass',
    'a fast-absorbing protein source to help meet daily protein targets',
  ],
  'protein-plant': [
    'a complete plant-based protein source supporting muscle maintenance',
    'helps meet daily protein needs without dairy',
  ],
  'protein-mass': [
    'provides extra calories and protein to support a calorie surplus',
    'supports muscle growth when combined with resistance training and sufficient calories',
  ],
  'protein-clear': [
    'a light, fruit-flavoured protein source for muscle maintenance',
    'an easy-to-digest alternative to milk-based protein',
  ],
  creatine: [
    'increases physical performance in successive bursts of short-term, high-intensity exercise',
    'supported by extensive research as one of the most studied sports supplements',
  ],
  'pre-workout-stim': [
    'caffeine contributes to increased alertness and concentration',
    'may support improved focus and energy output during training',
  ],
  'pre-workout-stim-free': [
    'supports training energy and blood flow without stimulants',
    'a caffeine-free option for training energy and focus',
  ],
  aminos: [
    'essential amino acids support muscle protein synthesis',
    'may support recovery during and after exercise',
  ],
  electrolytes: [
    'replaces electrolytes lost through sweat during exercise',
    'supports normal hydration and fluid balance',
  ],
  'omega-3': [
    'EPA and DHA contribute to normal heart function',
    'DHA contributes to the maintenance of normal brain function',
  ],
  magnesium: [
    'contributes to normal muscle function and the reduction of tiredness and fatigue',
    'contributes to normal psychological function and a normal nervous system',
  ],
  'vitamin-d': [
    'contributes to the normal function of the immune system',
    'contributes to the maintenance of normal bones and muscle function',
  ],
  multivitamin: [
    'helps fill everyday gaps in vitamin and mineral intake',
    'contributes to normal energy-yielding metabolism',
  ],
  collagen: [
    'contributes to the maintenance of normal skin',
    'a source of collagen peptides commonly used to support joints and connective tissue',
  ],
  // Deliberately structure/function only. Glucosamine, MSM and curcumin have no
  // authorised EU/UK health claim for joints, so nothing here may say one — the
  // wording describes what the product IS and what it is traditionally used
  // for, which is the line the claim gate exists to hold.
  'joint-support': [
    'traditionally used to support joints and connective tissue',
    'a source of glucosamine, MSM and botanicals commonly taken by active people',
  ],
  'sleep-support': [
    'formulated with ingredients traditionally used to support relaxation and wind-down',
    'may support a normal, restful sleep routine',
  ],
  'fat-burner': [
    'formulated to support metabolism alongside a calorie deficit and exercise',
    'contains ingredients commonly used to support energy expenditure',
  ],
  adaptogen: [
    'ashwagandha is traditionally used to help the body adapt to everyday stress',
    'may support a balanced response to everyday stress',
  ],
  probiotic: [
    'live cultures support a balanced gut microbiome',
    'may support normal digestive function',
  ],
  greens: [
    'a concentrated source of micronutrients from fruit and vegetable extracts',
    'supports overall nutrient intake alongside a varied diet',
  ],
  fibre: [
    'contributes to normal bowel function',
    'supports digestive regularity as part of a varied diet',
  ],
  menopause: [
    'formulated with botanicals traditionally used to support hormonal balance',
    'may support common menopause symptoms such as hot flushes, as part of a balanced lifestyle',
  ],
  'vitamin-c': [
    'contributes to the normal function of the immune system',
    'contributes to the reduction of tiredness and fatigue',
  ],
  general: [
    'formulated to support your everyday health routine',
  ],
}

export function getApprovedClaims(swapGroup: SwapGroup): string[] {
  return APPROVED_CLAIMS[swapGroup] ?? APPROVED_CLAIMS.general
}
