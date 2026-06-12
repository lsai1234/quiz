import type { Product } from './types'

// A "role" is the functional job a product does in a stack. Used to:
// 1. Deduplicate — a stack should never contain two creatines or two pre-workouts
// 2. Explain — plain-English copy for people who don't know supplements

export interface RoleInfo {
  id: string
  label: string
  benefit: string
}

// Ordered most-specific first — first match wins
const ROLE_RULES: Array<RoleInfo & { match: RegExp }> = [
  { id: 'mass-gainer', label: 'Mass Gainer', benefit: 'Extra calories + protein to help you gain size', match: /mass|gainer/ },
  { id: 'creatine', label: 'Creatine', benefit: 'Builds strength & power over time — take daily', match: /creatine/ },
  { id: 'protein', label: 'Protein', benefit: 'Daily protein to build & repair muscle', match: /whey|casein|isolate|protein/ },
  { id: 'pre-workout-stim-free', label: 'Stim-Free Pre-Workout', benefit: 'Training energy & blood flow — without caffeine', match: /(stim-?free|stimulant-?free|zero stimulant|caffeine-?free).*(pre|pump)|pump.*(stim-?free|zero stimulant)|^pump\b/ },
  { id: 'pre-workout', label: 'Pre-Workout', benefit: 'Energy & focus boost taken before training', match: /pre-?workout|pre workout/ },
  { id: 'aminos', label: 'Amino Acids', benefit: 'Supports muscle recovery during & after workouts', match: /bcaa|\beaa\b|amino/ },
  { id: 'electrolytes', label: 'Hydration', benefit: 'Replaces the minerals you lose when you sweat', match: /electrolyte|hydration/ },
  { id: 'omega-3', label: 'Omega-3', benefit: 'Supports heart, brain & joint health', match: /omega|fish oil/ },
  { id: 'magnesium', label: 'Magnesium', benefit: 'Supports sleep quality, muscles & recovery', match: /magnesium|\bzma\b/ },
  { id: 'vitamin-d', label: 'Vitamin D', benefit: 'Supports bones, immunity & energy levels', match: /vitamin d/ },
  { id: 'multivitamin', label: 'Multivitamin', benefit: 'Covers everyday vitamin & mineral gaps', match: /multivitamin|multi vitamin|multi-vitamin/ },
  { id: 'collagen', label: 'Collagen', benefit: 'Supports joints, skin & connective tissue', match: /collagen/ },
  { id: 'sleep', label: 'Sleep Support', benefit: 'Helps you wind down & sleep deeper', match: /sleep/ },
  { id: 'fat-burner', label: 'Fat Burner', benefit: 'Supports metabolism alongside a calorie deficit', match: /fat burn|thermo|fat-x|fat direct|cellulite|slimming/ },
  { id: 'adaptogen', label: 'Stress Support', benefit: 'Helps your body manage stress & recovery', match: /ashwagandha|adaptogen|rhodiola|ginseng/ },
]

const FALLBACK: RoleInfo = { id: 'general', label: 'Wellness', benefit: 'Supports your overall health routine' }

export function getRole(product: Product): RoleInfo {
  const haystack = `${product.name} ${product.subcategory}`.toLowerCase()
  for (const rule of ROLE_RULES) {
    if (rule.match.test(haystack)) return rule
  }
  // Fall back to category-based label so the chip is never blank
  return { ...FALLBACK, label: product.category || FALLBACK.label }
}
