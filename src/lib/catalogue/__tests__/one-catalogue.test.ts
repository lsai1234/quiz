/**
 * One catalogue, everywhere.
 *
 * The quiz picks product ids out of a catalogue and the reveal looks those ids
 * back up in one. When the two aren't the same catalogue, every card on the
 * reveal reads "Product unavailable" at £0.00 while the AI's reason still names
 * the product it was written about — which is exactly what happened when the
 * store defaulted to the mock catalogue and nothing had fetched the real one.
 *
 * These pin the three things that made that possible.
 */
import { buildStackBlueprint } from '@/lib/stack-blueprint'
import { useQuizStore } from '@/lib/store'
import { loadCatalogue, invalidateCatalogue } from '../load'
import { MOCK_CATALOGUE } from '../mock-catalogue'
import type { QuizAnswers } from '@/lib/types'

function makeAnswers(overrides: Partial<QuizAnswers> = {}): QuizAnswers {
  return {
    name: 'Test User',
    track: 'performance',
    ageBracket: '25-34',
    exactAge: null,
    gender: 'male',
    goals: ['muscle'],
    trainingFrequency: '3-4x',
    trainingType: ['strength'],
    lifestyle: [],
    diet: 'mostly-good',
    currentSupplements: [],
    currentVitamins: [],
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

beforeEach(() => {
  invalidateCatalogue()
})

describe('the store never invents a catalogue', () => {
  it('starts with no products, so nothing can build a stack before one loads', () => {
    expect(useQuizStore.getState().catalogueProducts).toEqual([])
  })
})

describe('buildStackBlueprint on an empty catalogue', () => {
  it('builds an empty stack rather than falling back to sample products', () => {
    const blueprint = buildStackBlueprint(makeAnswers(), [])
    expect(blueprint.slots).toHaveLength(0)
    expect(blueprint.estimatedOneOffPrice).toBe(0)
  })

  it('reports every chosen goal as unmet, instead of quietly filling the gap', () => {
    const blueprint = buildStackBlueprint(makeAnswers({ goals: ['muscle', 'recovery'] }), [])
    expect(blueprint.unmetGoals).toEqual(['muscle', 'recovery'])
  })
})

describe('loadCatalogue', () => {
  it('puts the fetched products in the store for everything else to read', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ products: MOCK_CATALOGUE, source: 'real' }),
    }) as unknown as typeof fetch

    const { products, source, error } = await loadCatalogue()

    expect(source).toBe('real')
    expect(error).toBeNull()
    expect(products).toHaveLength(MOCK_CATALOGUE.length)
    expect(useQuizStore.getState().catalogueProducts).toHaveLength(MOCK_CATALOGUE.length)
  })

  it('fetches once however many callers ask, so they all see the same catalogue', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ products: MOCK_CATALOGUE, source: 'real' }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const [a, b, c] = await Promise.all([loadCatalogue(), loadCatalogue(), loadCatalogue()])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(a.products).toBe(b.products)
    expect(b.products).toBe(c.products)
  })

  it('calls an empty shop an error rather than substituting sample data', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ products: [], source: 'real' }),
    }) as unknown as typeof fetch

    const { products, error } = await loadCatalogue()

    expect(products).toEqual([])
    expect(error).toMatch(/empty/i)
    expect(useQuizStore.getState().catalogueProducts).toEqual([])
  })

  it('lets the next caller retry after a failed fetch', async () => {
    // The loader logs the failure; the assertion is about the retry, not the log.
    const logged = jest.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ ok: true, json: async () => ({ products: MOCK_CATALOGUE, source: 'real' }) })
    global.fetch = fetchMock as unknown as typeof fetch

    const failed = await loadCatalogue()
    expect(failed.error).toBe('offline')

    const retried = await loadCatalogue()
    expect(retried.products).toHaveLength(MOCK_CATALOGUE.length)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    logged.mockRestore()
  })
})
