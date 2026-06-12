import type { QuizAnswers, Product, RecommendedStack, StackLevel } from './types'
import { MOCK_PRODUCTS } from './mock-products'

export { MOCK_PRODUCTS }

function budgetLimit(budget: QuizAnswers['budget']): number {
  switch (budget) {
    case 'under-50': return 50
    case '50-100': return 100
    case '100-150': return 150
    case '150-plus': return 200
    default: return 100
  }
}

function scoreProduct(product: Product, answers: QuizAnswers): number {
  let score = product.stackPriority * 10

  // Goal alignment
  const goalMatches = answers.goals.filter(g => product.goalTags.includes(g)).length
  score += goalMatches * 15

  // Stimulant filter — respect explicit stim preference drill-down answer
  if (product.stimulant && answers.stimPreference === 'no') return -1
  if (product.stimulant && answers.caffeineLevel === 'none') return -1
  if (product.stimulant && answers.caffeineLevel === 'low') score -= 5

  // Vegan filter
  if (!product.vegan && answers.lifestyle.includes('vegan')) return -1

  // Already taking filter — don't double-up same category
  const currentSuppCategories = answers.currentSupplements.map(s => s.toLowerCase())
  if (currentSuppCategories.includes('protein') && product.subcategory === 'Whey') score -= 20
  if (currentSuppCategories.includes('protein') && product.subcategory === 'Plant-based') score -= 20
  if (currentSuppCategories.includes('creatine') && product.category === 'Performance') score -= 15
  if (currentSuppCategories.includes('pre-workout') && product.category === 'Pre-Workout') score -= 15

  // Beginner safety — use drill-down experience level when available
  if (answers.trainingExperience === 'new' && product.beginner) score += 8
  if (answers.trainingExperience === 'experienced' && product.beginner) score -= 3
  if (!product.beginner && (answers.trainingFrequency === '1-2x' || answers.trainingExperience === 'new')) score -= 10

  // Training type boosts
  if (answers.trainingType === 'strength' && ['Performance', 'Protein'].includes(product.category)) score += 10
  if (answers.trainingType === 'cardio' && product.category === 'Hydration') score += 10
  if (answers.trainingType === 'hiit' && product.stimulant) score += 5
  if (answers.trainingType === 'sport' && product.category === 'Hydration') score += 8

  // Lifestyle boosts
  if (answers.lifestyle.includes('poor-sleep') && product.id === 'sleep-support') score += 20
  if (answers.lifestyle.includes('poor-sleep') && product.id === 'magnesium') score += 15
  if (answers.lifestyle.includes('desk-job') && product.id === 'vitamin-d3-k2') score += 10
  if (answers.lifestyle.includes('high-stress') && product.id === 'sleep-support') score += 10

  // Age bracket boosts
  if (answers.ageBracket === '45+') {
    if (product.id === 'vitamin-d3-k2') score += 15
    if (product.id === 'magnesium') score += 12
    if (product.id === 'collagen') score += 12
    if (product.id === 'omega3') score += 8
    if (product.stimulant) score -= 5
  }
  if (answers.ageBracket === '35-44') {
    if (product.id === 'vitamin-d3-k2') score += 8
    if (product.id === 'magnesium') score += 8
    if (product.id === 'collagen') score += 6
  }
  if (answers.ageBracket === '16-24') {
    if (product.stimulant && answers.trainingExperience !== 'experienced') score -= 5
  }

  return score
}

function resolveStackLevel(answers: QuizAnswers): StackLevel {
  if (answers.stackPreference === 'simple' || answers.budget === 'under-50') return 'essentials'
  if (answers.stackPreference === 'complete') return 'complete'
  return 'performance'
}

export function buildRecommendedStack(answers: QuizAnswers, catalogue: Product[] = MOCK_PRODUCTS as Product[]): RecommendedStack {
  const level = resolveStackLevel(answers)
  const limit = budgetLimit(answers.budget)

  const scored = catalogue
    .map(p => ({ product: p, score: scoreProduct(p, answers) }))
    .filter(({ score }) => score >= 0)
    .filter(({ product }) => product.stackLevels.includes(level))
    .sort((a, b) => b.score - a.score)

  // Build core stack within budget
  const core: Product[] = []
  let total = 0
  const usedCategories = new Set<string>()

  for (const { product } of scored) {
    if (usedCategories.has(product.category)) continue
    if (total + product.price > limit) continue
    core.push(product)
    total += product.price
    usedCategories.add(product.category)
    if (core.length >= 6) break
  }

  // Upgrades: top-scored products not in core that fit budget at higher level
  const upgrades: Product[] = scored
    .filter(({ product }) => !core.includes(product))
    .filter(({ product }) => product.stackLevels.includes('complete'))
    .slice(0, 3)
    .map(({ product }) => product)

  // Exclusions — notable categories left out and why
  const excluded: Array<{ category: string; reason: string }> = []

  const hasPreWorkout = core.some(p => p.category === 'Pre-Workout')
  if (!hasPreWorkout && answers.caffeineLevel === 'none') {
    excluded.push({ category: 'Pre-Workout', reason: "You told us you prefer no caffeine — we've left stimulant-based pre-workouts out." })
  }

  const hasMassGainer = core.some(p => p.id === 'mass-gainer')
  if (!hasMassGainer && !answers.goals.includes('bulking')) {
    excluded.push({ category: 'Mass Gainer', reason: "Not aligned with your current goals — we only include it for active bulk phases." })
  }

  const hasFatBurner = core.some(p => p.id === 'fat-burner')
  if (!hasFatBurner && !answers.goals.includes('cutting')) {
    excluded.push({ category: 'Thermogenic', reason: "Not included as your goals aren't focused on a cutting phase right now." })
  }

  return { core, upgrades, excluded }
}

export function stackTotalPrice(products: Product[]): number {
  return products.reduce((sum, p) => sum + p.price, 0)
}
