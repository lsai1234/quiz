/**
 * The quiz never recommends something nobody can buy.
 *
 * This was a real gap: `buildStackBlueprint` gated on subscription-only and
 * minimum line price but never on availability, so a member could finish the
 * quiz, see their stack, and only learn at `validateCheckout` that a line was
 * out of stock. It stayed invisible because every variant in MOCK_CATALOGUE is
 * `available: true` — so these tests build their own sold-out products rather
 * than relying on the mock ever having one.
 */
import { buildStackBlueprint } from '../factory'
import { buildSlotOptions } from '../personalise'
import { validateCheckout } from '../checkout'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import { isInStock, inStockOnly } from '@/lib/catalogue/filters'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { QuizAnswers } from '@/lib/types'

function makeAnswers(overrides: Partial<QuizAnswers> = {}): QuizAnswers {
  return {
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
    wellbeingAnswers: {},
    caffeineLevel: 'high',
    budget: '80-plus',
    stackPreference: 'complete',
    trainingExperience: 'intermediate',
    trainingFocus: null,
    stimPreference: 'yes',
    trainingTime: null,
    ...overrides,
  }
}

/** The same product, sold out — every variant unavailable. */
function soldOut(p: CatalogueProduct): CatalogueProduct {
  return { ...p, variants: p.variants.map((v) => ({ ...v, available: false })) }
}

describe('isInStock', () => {
  it('is true when any variant is available and false when none are', () => {
    const p = MOCK_CATALOGUE[0]
    expect(isInStock(p)).toBe(true)
    expect(isInStock(soldOut(p))).toBe(false)
  })

  it('treats a partially sold-out product as buyable — one variant is enough', () => {
    const p = MOCK_CATALOGUE.find((x) => x.variants.length > 1)
    if (!p) return
    const partial = {
      ...p,
      variants: p.variants.map((v, i) => ({ ...v, available: i === 0 })),
    }
    expect(isInStock(partial)).toBe(true)
  })

  it('drops only the unavailable products', () => {
    const [a, b, c] = MOCK_CATALOGUE
    expect(inStockOnly([a, soldOut(b), c]).map((p) => p.id)).toEqual([a.id, c.id])
  })
})

describe('buildStackBlueprint excludes out-of-stock products', () => {
  it('never selects a product with no available variant', () => {
    const answers = makeAnswers()
    // Everything the engine would otherwise reach for, sold out.
    const allSoldOut = MOCK_CATALOGUE.map(soldOut)
    const blueprint = buildStackBlueprint(answers, allSoldOut)
    expect(blueprint.slots).toHaveLength(0)
  })

  it('picks the next best in-stock product rather than the sold-out favourite', () => {
    const answers = makeAnswers()
    const baseline = buildStackBlueprint(answers, MOCK_CATALOGUE)
    expect(baseline.slots.length).toBeGreaterThan(0)

    const firstPick = baseline.slots[0].selectedProductId
    const catalogue = MOCK_CATALOGUE.map((p) => (p.id === firstPick ? soldOut(p) : p))
    const blueprint = buildStackBlueprint(answers, catalogue)

    const chosen = blueprint.slots.map((s) => s.selectedProductId)
    expect(chosen).not.toContain(firstPick)
  })

  it('produces a stack that passes checkout validation when some catalogue is sold out', () => {
    const answers = makeAnswers()
    // Sell out every other product — enough to bite, not enough to empty the shop.
    const catalogue = MOCK_CATALOGUE.map((p, i) => (i % 2 === 0 ? soldOut(p) : p))
    const blueprint = buildStackBlueprint(answers, catalogue)

    expect(blueprint.slots.length).toBeGreaterThan(0)
    const result = validateCheckout(blueprint, catalogue)
    expect(result.ok).toBe(true)
  })

  it('omits a slot whose only candidates are sold out, rather than recommending one', () => {
    const answers = makeAnswers()
    const baseline = buildStackBlueprint(answers, MOCK_CATALOGUE)
    const proteinSlot = baseline.slots.find((s) => s.slotType === 'protein')
    if (!proteinSlot) return

    // Sell out every product that could fill the protein slot.
    const catalogue = MOCK_CATALOGUE.map((p) =>
      p.stackSlots.includes('protein') ? soldOut(p) : p,
    )
    const blueprint = buildStackBlueprint(answers, catalogue)

    expect(blueprint.slots.some((s) => s.slotType === 'protein')).toBe(false)
    // The rest of the stack still builds — one empty slot is not a dead quiz.
    expect(blueprint.slots.length).toBeGreaterThan(0)
  })
})

describe('buildSlotOptions excludes out-of-stock products', () => {
  it('never offers the AI an option nobody can buy', () => {
    const answers = makeAnswers()
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    expect(blueprint.slots.length).toBeGreaterThan(0)

    const chosen = new Set(blueprint.slots.map((s) => s.selectedProductId))
    // Sell out everything the engine did NOT pick, so only the current picks
    // remain buyable.
    const catalogue = MOCK_CATALOGUE.map((p) => (chosen.has(p.id) ? p : soldOut(p)))

    const options = buildSlotOptions(blueprint, answers, catalogue)
    const byId = new Map(catalogue.map((p) => [p.id, p]))

    for (const slot of options) {
      for (const option of slot.options) {
        const product = byId.get(option.id)
        if (!product) continue
        // The only permitted unavailable option is the slot's own current pick.
        if (!isInStock(product)) {
          expect(option.id).toBe(slot.currentProductId)
        }
      }
    }
  })

  it("keeps the slot's current pick in its own options even when it goes out of stock", () => {
    const answers = makeAnswers()
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    const slot = blueprint.slots[0]
    expect(slot).toBeDefined()

    // The chosen product sells out after the stack was built.
    const catalogue = MOCK_CATALOGUE.map((p) =>
      p.id === slot.selectedProductId ? soldOut(p) : p,
    )
    const options = buildSlotOptions(blueprint, answers, catalogue)
    const forSlot = options.find((o) => o.slotId === slot.slotId)

    expect(forSlot?.options.map((o) => o.id)).toContain(slot.selectedProductId)
  })
})
