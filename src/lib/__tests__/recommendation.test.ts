import {
  MOCK_PRODUCTS,
  getEligibleCandidates,
  buildStackFromAIOrder,
  buildRecommendedStack,
  stackTotalPrice,
} from '../recommendation'
import { parseAIStackResult } from '../ai-stack'
import { getRole } from '../product-roles'
import type { QuizAnswers } from '../types'

function makeAnswers(overrides: Partial<QuizAnswers> = {}): QuizAnswers {
  return {
    name: 'Test User',
    track: 'performance',
    ageBracket: '25-34',
    exactAge: null,
    gender: 'male',
    goals: ['muscle', 'performance'],
    trainingFrequency: '3-4x',
    trainingType: 'strength',
    lifestyle: [],
    diet: 'mostly-good',
    currentSupplements: [],
    currentVitamins: [],
    preferredFormats: [],
    wellbeingAnswers: {},
    caffeineLevel: 'medium',
    budget: '50-80',
    stackPreference: 'balanced',
    trainingExperience: 'intermediate',
    trainingFocus: null,
    stimPreference: 'yes',
    trainingTime: null,
    ...overrides,
  }
}

describe('getEligibleCandidates (hard gates)', () => {
  it('excludes non-vegan products for vegan users', () => {
    const eligible = getEligibleCandidates(makeAnswers({ lifestyle: ['vegan'] }))
    const ids = eligible.map(e => e.product.id)
    expect(ids).not.toContain('whey-protein')
    expect(ids).not.toContain('omega3')
    expect(ids).toContain('vegan-protein')
  })

  it('excludes stimulants when the user wants none', () => {
    const eligible = getEligibleCandidates(makeAnswers({ stimPreference: 'no', caffeineLevel: 'none' }))
    expect(eligible.every(e => !e.product.stimulant)).toBe(true)
  })
})

describe('buildStackFromAIOrder', () => {
  it('honours the AI ordering for selection', () => {
    const stack = buildStackFromAIOrder(makeAnswers(), MOCK_PRODUCTS, ['creatine-mono', 'whey-protein'])
    expect(stack.core[0].id).toBe('creatine-mono')
  })

  it('still enforces the budget ceiling regardless of AI order', () => {
    // under-30 → £30 limit. Whey (34.99) alone exceeds it and must be skipped.
    const stack = buildStackFromAIOrder(
      makeAnswers({ budget: 'under-30', stackPreference: 'simple' }),
      MOCK_PRODUCTS,
      ['whey-protein', 'creatine-mono'],
    )
    expect(stack.core.map(p => p.id)).not.toContain('whey-protein')
    expect(stackTotalPrice(stack.core)).toBeLessThanOrEqual(30)
  })

  it('never puts two products of the same role in the core', () => {
    const stack = buildStackFromAIOrder(makeAnswers(), MOCK_PRODUCTS, ['whey-protein', 'vegan-protein'])
    const proteinCount = stack.core.filter(p => getRole(p).id === 'protein').length
    expect(proteinCount).toBeLessThanOrEqual(1)
  })

  it('ignores AI ids that fail eligibility (e.g. non-vegan for a vegan user)', () => {
    const stack = buildStackFromAIOrder(
      makeAnswers({ lifestyle: ['vegan'] }),
      MOCK_PRODUCTS,
      ['whey-protein'],
    )
    expect(stack.core.map(p => p.id)).not.toContain('whey-protein')
    // Falls back to a valid deterministic stack rather than returning nothing.
    expect(stack.core.length).toBeGreaterThan(0)
  })

  it('matches the deterministic stack when the AI order is empty', () => {
    const answers = makeAnswers()
    const ai = buildStackFromAIOrder(answers, MOCK_PRODUCTS, [])
    const deterministic = buildRecommendedStack(answers, MOCK_PRODUCTS)
    expect(ai.core.map(p => p.id)).toEqual(deterministic.core.map(p => p.id))
  })
})

describe('parseAIStackResult', () => {
  const eligible = new Set(['a', 'b'])

  it('keeps only eligible ids, dedupes order and sanitises reasons', () => {
    const result = parseAIStackResult(
      { order: ['a', 'x', 'a', 'b'], reasons: { a: '**great fit**', x: 'nope', b: '' } },
      eligible,
    )
    expect(result).not.toBeNull()
    expect(result!.order).toEqual(['a', 'b'])
    expect(result!.reasons).toEqual({ a: 'great fit' })
  })

  it('returns null when no usable ids remain', () => {
    expect(parseAIStackResult({ order: ['x', 'y'] }, eligible)).toBeNull()
    expect(parseAIStackResult({}, eligible)).toBeNull()
    expect(parseAIStackResult(null, eligible)).toBeNull()
  })
})
