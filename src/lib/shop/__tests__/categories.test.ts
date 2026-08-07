import { groupByCategory, categorySlug } from '../categories'
import type { CatalogueProduct } from '@/lib/catalogue/types'

function makeProduct(id: string, category: string): CatalogueProduct {
  return {
    id, title: id, handle: id, description: '', imageUrl: null, category,
    stackSlots: ['protein'], goals: ['muscle'], dietaryTags: [], formats: ['powder'],
    variants: [], basePrice: 30, compareAtPrice: null, subscriptionEligible: true,
    servings: 30, swapGroup: 'protein-whey', recommendationPriority: 7, marginPriority: 5,
    isCoreEligible: true, isBoosterEligible: false, hasStimulants: false, shortReason: '',
    warnings: [],
  }
}

describe('categorySlug', () => {
  it('makes a DOM-safe slug', () => {
    expect(categorySlug('Pre-Workout')).toBe('pre-workout')
    expect(categorySlug('Gut Health')).toBe('gut-health')
    expect(categorySlug('Menopause Support')).toBe('menopause-support')
  })
})

describe('groupByCategory', () => {
  it('groups products under their category', () => {
    const sections = groupByCategory([
      makeProduct('a', 'Protein'),
      makeProduct('b', 'Protein'),
      makeProduct('c', 'Health'),
    ])
    const protein = sections.find((s) => s.category === 'Protein')
    expect(protein?.products.map((p) => p.id)).toEqual(['a', 'b'])
    expect(sections.find((s) => s.category === 'Health')?.products).toHaveLength(1)
  })

  it('orders curated categories first, in their defined order', () => {
    const sections = groupByCategory([
      makeProduct('h', 'Health'),
      makeProduct('p', 'Protein'),
      makeProduct('s', 'Sleep'),
    ])
    expect(sections.map((s) => s.category)).toEqual(['Protein', 'Health', 'Sleep'])
  })

  it('appends unknown categories alphabetically after the curated ones', () => {
    const sections = groupByCategory([
      makeProduct('z', 'Zzz Unknown'),
      makeProduct('a', 'Aaa Unknown'),
      makeProduct('p', 'Protein'),
    ])
    expect(sections.map((s) => s.category)).toEqual(['Protein', 'Aaa Unknown', 'Zzz Unknown'])
  })

  it('preserves product order within a section', () => {
    const sections = groupByCategory([
      makeProduct('first', 'Protein'),
      makeProduct('second', 'Protein'),
      makeProduct('third', 'Protein'),
    ])
    expect(sections[0].products.map((p) => p.id)).toEqual(['first', 'second', 'third'])
  })
})
