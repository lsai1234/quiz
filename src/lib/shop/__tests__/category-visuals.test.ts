import { categoryHue } from '../category-visuals'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'

describe('categoryHue', () => {
  it('gives every product in a category the same colour', () => {
    // The bug this replaces: the chip took its hue from the product's first
    // stack slot, so two creatine products could carry two different colours.
    const byCategory = new Map<string, Set<string>>()
    for (const p of MOCK_CATALOGUE) {
      const hues = byCategory.get(p.category) ?? new Set<string>()
      hues.add(categoryHue(p.category))
      byCategory.set(p.category, hues)
    }
    for (const [category, hues] of byCategory) {
      expect([category, hues.size]).toEqual([category, 1])
    }
  })

  it('ignores casing and punctuation', () => {
    expect(categoryHue('Pre-Workout')).toBe(categoryHue('pre workout'))
    expect(categoryHue('Creatine Supplements')).toBe(categoryHue('creatine supplements'))
  })

  it('is stable for categories it has never seen', () => {
    expect(categoryHue('Endurance Fuel')).toBe(categoryHue('Endurance Fuel'))
    expect(categoryHue('Endurance Fuel')).toMatch(/^#[0-9A-F]{6}$/i)
  })

  it('keeps the shop’s own categories distinct from each other', () => {
    const curated = [
      'Protein', 'Performance', 'Creatine', 'Pre-Workout', 'Amino Acids', 'Endurance',
      'Hydration', 'Recovery', 'Health', 'Gut Health', 'Sleep', 'Menopause Support',
    ]
    expect(new Set(curated.map(categoryHue)).size).toBe(curated.length)
  })

  it('never reuses the brand accent, which the badge beside it owns', () => {
    const all = [...new Set(MOCK_CATALOGUE.map((p) => p.category))].map(categoryHue)
    expect(all).not.toContain('#00D4FF')
  })

  it('falls back to a real colour for a missing category', () => {
    expect(categoryHue(undefined)).toMatch(/^#[0-9A-F]{6}$/i)
    expect(categoryHue('')).toMatch(/^#[0-9A-F]{6}$/i)
  })
})
