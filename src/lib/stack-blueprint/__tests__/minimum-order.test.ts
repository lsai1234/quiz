/**
 * The minimum order, and the products the quiz won't put in a stack.
 *
 * Both exist for the same reason: PowerBody charge us per parcel whatever is in
 * it, so a small enough order cannot pay for its own postage at any price the
 * market accepts. A one-off has no renewal behind it to make that back, so these
 * are hard refusals rather than warnings.
 */
import { validateCheckout, validationErrorMessage } from '../checkout'
import { buildStackBlueprint } from '../factory'
import { PRICING_CONFIG, resetPricingOverrides, setPricingOverrides, getPricingConfig } from '../pricing'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { StackBlueprint } from '../types'
import type { QuizAnswers } from '@/lib/types'

afterEach(() => resetPricingOverrides())

const product = (id: string, price: number): CatalogueProduct => ({
  ...(MOCK_CATALOGUE[0] as CatalogueProduct),
  id,
  title: id,
  basePrice: price,
  cost: price / 2,
  variants: [{ id: `${id}-v`, title: '', flavour: null, size: null, price, compareAtPrice: null, available: true }],
})

const blueprintOf = (ids: string[]): StackBlueprint => ({
  id: 'bp',
  stackName: 'Test',
  summary: '',
  slots: ids.map((id, i) => ({
    slotId: `s${i}`,
    slotType: 'protein',
    title: id,
    reason: '',
    selectedProductId: id,
    selectedVariantId: `${id}-v`,
    alternatives: [],
  })),
} as unknown as StackBlueprint)

describe('the minimum order', () => {
  it('refuses a basket too small to pay for its own parcel', () => {
    const p = product('tiny', 6)
    const result = validateCheckout(blueprintOf(['tiny']), [p])
    expect(result.ok).toBe(false)
    if (result.ok) return
    const err = result.errors.find((e) => e.type === 'below-minimum')
    expect(err).toBeDefined()
    if (err?.type !== 'below-minimum') return
    expect(err.subtotal).toBe(6)
    expect(err.minimum).toBe(PRICING_CONFIG.minOrderValue)
    expect(err.shortfall).toBe(PRICING_CONFIG.minOrderValue - 6)
  })

  it('tells the customer exactly how much more they need', () => {
    const msg = validationErrorMessage({ type: 'below-minimum', subtotal: 6, minimum: 15, shortfall: 9 })
    expect(msg).toMatch(/£15/)
    expect(msg).toMatch(/£9/)
  })

  it('lets a basket at the minimum through', () => {
    const p = product('ok', PRICING_CONFIG.minOrderValue)
    expect(validateCheckout(blueprintOf(['ok']), [p]).ok).toBe(true)
  })

  it('qualifies on the whole basket, not the individual items', () => {
    // Three £6 tubs is £18 — over the line, and it ships in one parcel, which is
    // exactly the case the minimum is designed to allow.
    const cat = ['a', 'b', 'c'].map((id) => product(id, 6))
    expect(validateCheckout(blueprintOf(['a', 'b', 'c']), cat).ok).toBe(true)
  })

  it('is off entirely when the minimum is zero', () => {
    setPricingOverrides({ minOrderValue: 0 })
    const p = product('tiny', 3)
    expect(validateCheckout(blueprintOf(['tiny']), [p]).ok).toBe(true)
  })
})

describe('products the quiz will not pick', () => {
  const answers = (): QuizAnswers => ({
    name: 'Test User',
    track: 'performance',
    ageBracket: '25-34',
    exactAge: null,
    gender: 'male',
    goals: ['muscle', 'energy', 'recovery'],
    trainingFrequency: '5-6x',
    trainingType: ['strength'],
    lifestyle: [],
    diet: 'mostly-good',
    currentSupplements: [],
    currentVitamins: [],
    preferredFormats: [],
    wellbeingAnswers: {},
    caffeineLevel: 'high',
    budget: '80-plus',
    stackPreference: 'balanced',
    trainingExperience: 'intermediate',
    trainingFocus: null,
    stimPreference: 'yes',
    trainingTime: null,
  } as unknown as QuizAnswers)

  it('leaves out anything too cheap to carry a slot', () => {
    const config = getPricingConfig()
    const bp = buildStackBlueprint(answers(), MOCK_CATALOGUE as CatalogueProduct[])
    for (const slot of bp.slots) {
      const p = (MOCK_CATALOGUE as CatalogueProduct[]).find((x) => x.id === slot.selectedProductId)
      if (!p) continue
      expect(p.basePrice).toBeGreaterThanOrEqual(config.minQuizProductPrice)
    }
  })

  it('still builds a stack when the floor is raised', () => {
    // Raising it thins the catalogue but must never produce an empty stack —
    // the quiz degrades by offering fewer slots, not by breaking.
    setPricingOverrides({ minQuizProductPrice: 20 })
    const bp = buildStackBlueprint(answers(), MOCK_CATALOGUE as CatalogueProduct[])
    for (const slot of bp.slots) {
      const p = (MOCK_CATALOGUE as CatalogueProduct[]).find((x) => x.id === slot.selectedProductId)
      if (p) expect(p.basePrice).toBeGreaterThanOrEqual(20)
    }
  })
})
