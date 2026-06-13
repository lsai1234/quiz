import type { QuizAnswers, Product, RecommendedStack, StackLevel } from './types'
import { MOCK_PRODUCTS } from './mock-products'
import { getRole } from './product-roles'

export { MOCK_PRODUCTS }

function budgetLimit(budget: QuizAnswers['budget']): number {
  switch (budget) {
    case 'under-30': return 30
    case '30-50':    return 50
    case '50-80':    return 80
    case '80-plus':  return 150
    default:         return 80
  }
}

function scoreProduct(product: Product, answers: QuizAnswers): number {
  let score = product.stackPriority * 10
  const role = getRole(product).id

  // Goal alignment
  const goalMatches = answers.goals.filter(g => product.goalTags.includes(g)).length
  score += goalMatches * 15

  // Stimulant filter — respect explicit stim preference drill-down answer
  if (product.stimulant && answers.stimPreference === 'no') return -1
  if (product.stimulant && answers.caffeineLevel === 'none') return -1
  if (product.stimulant && answers.caffeineLevel === 'low') score -= 5

  // Vegan filter
  if (!product.vegan && answers.lifestyle.includes('vegan')) return -1

  // Already taking filter — don't double-up what the user already has
  const currentSupps = answers.currentSupplements.map(s => s.toLowerCase())
  if (currentSupps.includes('protein') && role === 'protein') score -= 20
  if (currentSupps.includes('creatine') && role === 'creatine') score -= 15
  if (currentSupps.includes('pre-workout') && role.startsWith('pre-workout')) score -= 15

  // Beginner safety — use drill-down experience level when available
  if (answers.trainingExperience === 'new' && product.beginner) score += 8
  if (answers.trainingExperience === 'experienced' && product.beginner) score -= 3
  if (!product.beginner && (answers.trainingFrequency === '1-2x' || answers.trainingExperience === 'new')) score -= 10

  // Training type boosts
  if (answers.trainingType === 'strength' && ['Performance', 'Protein'].includes(product.category)) score += 10
  if (answers.trainingType === 'cardio' && product.category === 'Hydration') score += 10
  if (answers.trainingType === 'hiit' && product.stimulant) score += 5
  if (answers.trainingType === 'sport' && product.category === 'Hydration') score += 8

  // Lifestyle boosts (role-based so they work with any catalogue)
  if (answers.lifestyle.includes('poor-sleep') && role === 'sleep') score += 20
  if (answers.lifestyle.includes('poor-sleep') && role === 'magnesium') score += 15
  if (answers.lifestyle.includes('desk-job') && (role === 'vitamin-d' || role === 'multivitamin')) score += 10
  if (answers.lifestyle.includes('high-stress') && (role === 'sleep' || role === 'adaptogen')) score += 10

  // Age bracket boosts
  if (answers.ageBracket === '45+') {
    if (role === 'vitamin-d' || role === 'multivitamin') score += 15
    if (role === 'magnesium') score += 12
    if (role === 'collagen') score += 12
    if (role === 'omega-3') score += 8
    if (product.stimulant) score -= 5
  }
  if (answers.ageBracket === '35-44') {
    if (role === 'vitamin-d' || role === 'multivitamin') score += 8
    if (role === 'magnesium') score += 8
    if (role === 'collagen') score += 6
  }
  if (answers.ageBracket === '16-24') {
    if (product.stimulant && answers.trainingExperience !== 'experienced') score -= 5
  }

  return score
}

function resolveStackLevel(answers: QuizAnswers): StackLevel {
  if (answers.stackPreference === 'simple' || answers.budget === 'under-30' || answers.budget === '30-50') return 'essentials'
  if (answers.stackPreference === 'complete') return 'complete'
  return 'performance'
}

// Stim and stim-free pre-workouts fill the same slot in a stack
function dedupeRole(product: Product): string {
  const id = getRole(product).id
  return id.startsWith('pre-workout') ? 'pre-workout' : id
}

interface ScoredProduct {
  product: Product
  score: number
}

/**
 * Hard eligibility gate. Returns the products a user is *allowed* to be shown,
 * scored and sorted best-first. A negative score means a product is excluded
 * outright (vegan/stimulant conflicts, already-taking, etc.) — those never make
 * it into this list. This is the deterministic safety layer: the AI ranker is
 * only ever offered candidates that survive these gates, so it can re-prioritise
 * but can never recommend something the rules forbid.
 */
export function getEligibleCandidates(
  answers: QuizAnswers,
  catalogue: Product[] = MOCK_PRODUCTS as Product[],
  level: StackLevel = resolveStackLevel(answers),
): ScoredProduct[] {
  return catalogue
    .map(p => ({ product: p, score: scoreProduct(p, answers) }))
    .filter(({ score }) => score >= 0)
    .filter(({ product }) => product.stackLevels.includes(level))
    .sort((a, b) => b.score - a.score)
}

/**
 * Packs an already-ordered list of eligible candidates into a stack, enforcing
 * the budget ceiling, one-product-per-role de-duping and the single-stimulant
 * cap. Selection follows the order of `scored`, so whoever controls that order
 * (deterministic score, or the AI ranker) controls the stack — but the
 * constraints below are non-negotiable and applied here regardless.
 */
export function assembleStack(scored: ScoredProduct[], answers: QuizAnswers): RecommendedStack {
  const limit = budgetLimit(answers.budget)

  // Build core stack within budget.
  // Dedupe by functional role (creatine, protein, pre-workout…) so the stack
  // never contains two products doing the same job, and cap stimulants at one.
  const core: Product[] = []
  let total = 0
  let stimCount = 0
  const usedRoles = new Set<string>()

  for (const { product } of scored) {
    const role = dedupeRole(product)
    if (usedRoles.has(role)) continue
    if (product.stimulant && stimCount >= 1) continue
    if (total + product.price > limit) continue
    core.push(product)
    total += product.price
    usedRoles.add(role)
    if (product.stimulant) stimCount++
    if (core.length >= 6) break
  }

  // Upgrades: top-scored products covering roles not already in the stack
  const upgrades: Product[] = []
  const upgradeRoles = new Set(usedRoles)
  for (const { product } of scored) {
    if (core.includes(product)) continue
    if (!product.stackLevels.includes('complete')) continue
    const role = dedupeRole(product)
    if (upgradeRoles.has(role)) continue
    upgrades.push(product)
    upgradeRoles.add(role)
    if (upgrades.length >= 3) break
  }

  // Exclusions — notable categories left out and why
  const excluded: Array<{ category: string; reason: string }> = []

  const hasPreWorkout = core.some(p => getRole(p).id.startsWith('pre-workout'))
  if (!hasPreWorkout && answers.caffeineLevel === 'none') {
    excluded.push({ category: 'Pre-Workout', reason: "You told us you prefer no caffeine — we've left stimulant-based pre-workouts out." })
  }

  const hasMassGainer = core.some(p => getRole(p).id === 'mass-gainer')
  if (!hasMassGainer && !answers.goals.includes('bulking')) {
    excluded.push({ category: 'Mass Gainer', reason: "Not aligned with your current goals — we only include it for active bulk phases." })
  }

  const hasFatBurner = core.some(p => getRole(p).id === 'fat-burner')
  if (!hasFatBurner && !answers.goals.includes('cutting')) {
    excluded.push({ category: 'Thermogenic', reason: "Not included as your goals aren't focused on a cutting phase right now." })
  }

  return { core, upgrades, excluded }
}

/**
 * Deterministic recommendation engine. This is both the default path and the
 * fallback whenever the AI ranker is unavailable, slow, or returns something
 * that fails validation.
 */
export function buildRecommendedStack(answers: QuizAnswers, catalogue: Product[] = MOCK_PRODUCTS as Product[]): RecommendedStack {
  const level = resolveStackLevel(answers)
  const scored = getEligibleCandidates(answers, catalogue, level)
  return assembleStack(scored, answers)
}

/**
 * Builds a stack from an AI-supplied ordering of product ids while keeping every
 * hard constraint intact. The AI only ever reorders the *eligible* candidate set
 * — ids it returns that aren't eligible (don't exist, failed a gate, wrong stack
 * level) are silently ignored, and anything it omits falls back to deterministic
 * score order. Budget, role de-duping and the stimulant cap are still enforced
 * by `assembleStack`. The result is a genuinely AI-personalised selection that
 * cannot break the rules.
 */
export function buildStackFromAIOrder(
  answers: QuizAnswers,
  catalogue: Product[],
  aiOrder: string[],
): RecommendedStack {
  const level = resolveStackLevel(answers)
  const eligible = getEligibleCandidates(answers, catalogue, level)

  const byId = new Map(eligible.map(s => [s.product.id, s]))
  const rank = new Map(aiOrder.map((id, i) => [id, i]))

  // AI-ranked eligible products first (in the AI's order), then everything else
  // the AI didn't mention, kept in deterministic score order as a tiebreak.
  const reordered = [...eligible].sort((a, b) => {
    const ra = rank.has(a.product.id) ? rank.get(a.product.id)! : Infinity
    const rb = rank.has(b.product.id) ? rank.get(b.product.id)! : Infinity
    if (ra !== rb) return ra - rb
    return b.score - a.score
  })

  // If the AI named nothing we recognise, fall back to the deterministic stack.
  const recognised = aiOrder.some(id => byId.has(id))
  return assembleStack(recognised ? reordered : eligible, answers)
}

export interface PersonalisedStack extends RecommendedStack {
  /** AI-written reason per product id. Empty when the deterministic engine ran. */
  aiReasons: Record<string, string>
  /** True when the AI ranked the stack, false when it fell back to scoring. */
  personalised: boolean
}

/**
 * Client-side entry point. Asks the AI ranker (via /api/recommend-stack) for a
 * personalised selection and falls back to the deterministic engine if the
 * request fails for any reason, so the quiz can never get stuck.
 */
export async function fetchRecommendedStack(
  answers: QuizAnswers,
  catalogue: Product[] = MOCK_PRODUCTS as Product[],
): Promise<PersonalisedStack> {
  try {
    const res = await fetch('/api/recommend-stack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers, catalogue }),
    })
    if (!res.ok) throw new Error(`recommend-stack ${res.status}`)
    return (await res.json()) as PersonalisedStack
  } catch {
    return { ...buildRecommendedStack(answers, catalogue), aiReasons: {}, personalised: false }
  }
}

export function stackTotalPrice(products: Product[]): number {
  return products.reduce((sum, p) => sum + p.price, 0)
}
