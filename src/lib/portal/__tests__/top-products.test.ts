import {
  TOP_PRODUCT_LIMIT,
  normaliseRoster,
  applyTopRanks,
  resolveRoster,
  reorder,
  rankMap,
} from '../top-products'
import { scoreProduct } from '@/lib/stack-blueprint/factory'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { defaultAnswers } from '@/lib/store'
import type { CatalogueProduct } from '@/lib/catalogue/types'

const catalogue = MOCK_CATALOGUE as CatalogueProduct[]
const ids = (n: number) => catalogue.slice(0, n).map((p) => p.id)

describe('the Top 25 roster', () => {
  it('never holds more than the limit', () => {
    const tooMany = Array.from({ length: TOP_PRODUCT_LIMIT + 10 }, (_, i) => `p${i}`)
    expect(normaliseRoster(tooMany)).toHaveLength(TOP_PRODUCT_LIMIT)
  })

  it('drops duplicates, keeping the first position', () => {
    expect(normaliseRoster(['a', 'b', 'a', 'c'])).toEqual(['a', 'b', 'c'])
    expect(rankMap(['a', 'b', 'a']).get('b')).toBe(2)
  })

  it('stamps a rank onto rostered products and leaves the rest alone', () => {
    const ranked = applyTopRanks(catalogue, ids(3))
    expect(ranked[0].topRank).toBe(1)
    expect(ranked[1].topRank).toBe(2)
    expect(ranked[2].topRank).toBe(3)
    expect(ranked[3].topRank).toBeUndefined()
  })

  it('changes nothing at all when the roster is empty', () => {
    expect(applyTopRanks(catalogue, [])).toBe(catalogue)
  })

  it('degrades to a shorter roster when a product has been removed', () => {
    const slots = resolveRoster([catalogue[0].id, 'gone-forever'], catalogue)
    expect(slots).toHaveLength(2)
    expect(slots[0].product?.id).toBe(catalogue[0].id)
    // Still listed, so the hub can show it and offer to take it off.
    expect(slots[1].product).toBeNull()
  })

  it('reorders within bounds and ignores moves off either end', () => {
    const roster = ['a', 'b', 'c']
    expect(reorder(roster, 'b', -1)).toEqual(['b', 'a', 'c'])
    expect(reorder(roster, 'b', 1)).toEqual(['a', 'c', 'b'])
    expect(reorder(roster, 'a', -1)).toEqual(roster)
    expect(reorder(roster, 'c', 1)).toEqual(roster)
    expect(reorder(roster, 'missing', 1)).toEqual(roster)
  })
})

describe('the roster in the recommendation engine', () => {
  const answers = { ...defaultAnswers, goals: ['muscle' as const], track: 'performance' as const }
  const protein = catalogue.find((p) => p.stackSlots.includes('protein'))!

  it('lifts a rostered product above the same product unrostered', () => {
    const off = scoreProduct(protein, 'protein', answers, 'muscle')
    const on = scoreProduct({ ...protein, topRank: 1 }, 'protein', answers, 'muscle')
    expect(on).toBeGreaterThan(off)
  })

  it('ranks #1 above #25, but keeps every rostered product above an unrostered one', () => {
    const first = scoreProduct({ ...protein, topRank: 1 }, 'protein', answers, 'muscle')
    const last = scoreProduct({ ...protein, topRank: TOP_PRODUCT_LIMIT }, 'protein', answers, 'muscle')
    const off = scoreProduct(protein, 'protein', answers, 'muscle')
    expect(first).toBeGreaterThan(last)
    expect(last).toBeGreaterThan(off)
  })

  it('never outweighs actually matching the user’s goal', () => {
    // A rostered product with no goal overlap must not beat an unrostered one
    // that shares two of the user's goals — the roster is a tie-breaker, not a
    // reason to recommend the wrong thing.
    const twoGoals = { ...defaultAnswers, goals: ['muscle' as const, 'recovery' as const], track: 'performance' as const }
    const matching = { ...protein, goals: ['muscle' as const, 'recovery' as const], topRank: null }
    const rosteredMismatch = { ...protein, goals: [], topRank: 1 }
    expect(scoreProduct(matching, 'protein', twoGoals, 'muscle')).toBeGreaterThan(
      scoreProduct(rosteredMismatch, 'protein', twoGoals, 'muscle'),
    )
  })
})
