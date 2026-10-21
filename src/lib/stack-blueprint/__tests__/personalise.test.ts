import { buildStackBlueprint } from '../factory'
import { buildSlotOptions, applyBlueprintAIResult, applyBlueprintAIResultWithinBudget, personaliseBlueprint } from '../personalise'
import { parseBlueprintResult } from '@/lib/ai-stack'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import type { StackBlueprint } from '../types'
import type { BlueprintAIResult } from '@/lib/ai-stack'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { QuizAnswers } from '@/lib/types'

function makeAnswers(overrides: Partial<QuizAnswers> = {}): QuizAnswers {
  return {
    name: 'Test User',
    track: 'performance',
    ageBracket: '25-34',
    exactAge: null,
    gender: 'male',
    goals: ['muscle', 'performance'],
    trainingFrequency: '3-4x',
    trainingType: ['strength'],
    lifestyle: [],
    diet: 'mostly-good',
    currentSupplements: [],
    currentVitamins: [],
    wellbeingAnswers: {},
    caffeineLevel: 'medium',
    budget: '80-plus',
    stackPreference: 'complete',
    trainingExperience: 'intermediate',
    trainingFocus: null,
    stimPreference: 'yes',
    trainingTime: null,
    ...overrides,
  }
}

describe('buildSlotOptions', () => {
  it('always includes the current product among each slot options', () => {
    const answers = makeAnswers()
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    const slotOptions = buildSlotOptions(blueprint, answers, MOCK_CATALOGUE)

    expect(slotOptions.length).toBe(blueprint.slots.length)
    for (const so of slotOptions) {
      expect(so.options.map(o => o.id)).toContain(so.currentProductId)
      // Bounded by MAX_OPTIONS_PER_SLOT in personalise.ts (keeps the AI prompt small).
      expect(so.options.length).toBeLessThanOrEqual(8)
    }
  })

  it('never offers a product already selected in another slot', () => {
    const answers = makeAnswers()
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    const slotOptions = buildSlotOptions(blueprint, answers, MOCK_CATALOGUE)

    for (const so of slotOptions) {
      const otherSelected = blueprint.slots
        .filter(s => s.slotId !== so.slotId)
        .map(s => s.selectedProductId)
      for (const id of so.options.map(o => o.id)) {
        expect(otherSelected).not.toContain(id)
      }
    }
  })

  it('only offers vegan products for vegan users', () => {
    const answers = makeAnswers({ lifestyle: ['vegan'] })
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    const slotOptions = buildSlotOptions(blueprint, answers, MOCK_CATALOGUE)
    for (const so of slotOptions) {
      expect(so.options.every(o => o.vegan)).toBe(true)
    }
  })
})

describe('applyBlueprintAIResult', () => {
  const blueprint: StackBlueprint = {
    id: 'x',
    stackName: 'Test',
    summary: '',
    primaryGoal: 'muscle',
    secondaryGoals: [],
    userProfileSummary: '',
    estimatedOneOffPrice: 0,
    estimatedSubscriptionPrice: 0,
    savingsSummary: '',
    createdAt: '',
    slots: [
      { slotId: 'slot-protein', slotType: 'protein', title: 'Protein', description: '', recommendedProductId: 'a', selectedProductId: 'a', selectedVariantId: 'a-v1', required: true, canRemove: false, canSwap: true, swapGroup: 'protein-whey', reason: 'old', confidenceScore: 50, displayOrder: 0 },
      { slotId: 'slot-performance', slotType: 'performance', title: 'Performance', description: '', recommendedProductId: 'c', selectedProductId: 'c', selectedVariantId: null, required: false, canRemove: true, canSwap: true, swapGroup: 'creatine', reason: 'old2', confidenceScore: 50, displayOrder: 1 },
    ],
  }

  it('applies a valid choice and resets the variant', () => {
    const out = applyBlueprintAIResult(blueprint, { choices: { 'slot-protein': 'b' } })
    const slot = out.slots.find(s => s.slotId === 'slot-protein')!
    expect(slot.selectedProductId).toBe('b')
    expect(slot.selectedVariantId).toBeNull()
    expect(out.personalised).toBe(true)
  })

  it('skips a choice that would duplicate another slot product', () => {
    const out = applyBlueprintAIResult(blueprint, {
      choices: { 'slot-protein': 'c' }, // 'c' already used by slot-performance
    })
    expect(out.slots.find(s => s.slotId === 'slot-protein')!.selectedProductId).toBe('a')
  })

  it('leaves a slot the AI did not change exactly as the engine wrote it', () => {
    const out = applyBlueprintAIResult(blueprint, { choices: { 'slot-performance': 'c' } })
    expect(out.slots).toEqual(blueprint.slots)
  })

  /*
   * The model no longer writes customer text, but an old-shaped reply (or a
   * server mid-deploy) can still carry a `reasons` object. Whatever reaches
   * these functions, nothing in it may land on a slot.
   */
  const withReasons = (choices: Record<string, string>, reasons: Record<string, string>) =>
    ({ choices, reasons }) as BlueprintAIResult

  it('never writes an AI reason onto a slot, swapped or not', () => {
    const out = applyBlueprintAIResult(
      blueprint,
      withReasons(
        { 'slot-protein': 'b' },
        { 'slot-protein': 'Whey hits your protein target', 'slot-performance': 'Creatine for strength' },
      ),
    )
    for (const slot of out.slots) {
      expect(slot.reason).not.toMatch(/Whey hits|Creatine for strength/)
    }
    expect(out.slots.find(s => s.slotId === 'slot-performance')!.reason).toBe('old2')
  })

  it('gives a swapped slot the new product\'s catalogue line, not the replaced product\'s reason', () => {
    // The engine's reason was written about 'a'. Once the slot holds 'b', the
    // reason has to be about 'b', and the AI is not allowed to supply it.
    const catalogue = [
      { id: 'b', shortReason: 'Catalogue line for b', description: 'Longer description of b' },
    ] as unknown as CatalogueProduct[]
    const out = applyBlueprintAIResult(
      blueprint,
      withReasons({ 'slot-protein': 'b' }, { 'slot-protein': 'AI sales copy' }),
      catalogue,
    )
    expect(out.slots.find(s => s.slotId === 'slot-protein')!.reason).toBe('Catalogue line for b')
  })

  it('falls back to the catalogue description when a product has no short line', () => {
    const catalogue = [{ id: 'b', shortReason: '', description: 'Description of b' }] as unknown as CatalogueProduct[]
    const out = applyBlueprintAIResult(blueprint, { choices: { 'slot-protein': 'b' } }, catalogue)
    expect(out.slots.find(s => s.slotId === 'slot-protein')!.reason).toBe('Description of b')
  })

  it('does the same through the budget-gated apply', () => {
    const catalogue = [
      { id: 'b', shortReason: 'Catalogue line for b', description: '' },
    ] as unknown as CatalogueProduct[]
    const out = applyBlueprintAIResultWithinBudget(
      blueprint,
      withReasons({ 'slot-protein': 'b' }, { 'slot-protein': 'AI sales copy', 'slot-performance': 'More AI copy' }),
      catalogue,
      null,
    )
    expect(out.slots.map(s => s.reason)).toEqual(['Catalogue line for b', 'old2'])
  })
})

describe('personaliseBlueprint', () => {
  const realFetch = global.fetch
  afterEach(() => { global.fetch = realFetch })

  const reply = (body: unknown) =>
    jest.fn().mockResolvedValue({ ok: true, json: async () => body }) as unknown as typeof fetch

  it('reads only the product ids from the reply, never written reasons', async () => {
    const answers = makeAnswers()
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    // The first slot the AI has a real alternative for.
    const offered = buildSlotOptions(blueprint, answers, MOCK_CATALOGUE)
    const at = offered.findIndex(so => so.options.some(o => o.id !== so.currentProductId))
    expect(at).toBeGreaterThanOrEqual(0)
    const slot = blueprint.slots[at]
    const alt = offered[at].options.find(o => o.id !== slot.selectedProductId)!

    global.fetch = reply({
      personalised: true,
      choices: { [slot.slotId]: alt.id },
      reasons: Object.fromEntries(blueprint.slots.map(s => [s.slotId, 'AI-written copy'])),
    })
    const out = await personaliseBlueprint(answers, blueprint, MOCK_CATALOGUE)

    for (const s of out.slots) expect(s.reason).not.toBe('AI-written copy')
    // The top budget tier has no cap, so the swap is taken.
    expect(out.slots[at].selectedProductId).toBe(alt.id)
    const product = MOCK_CATALOGUE.find(p => p.id === alt.id)!
    expect(out.slots[at].reason).toBe(product.shortReason || product.description)
    // Slots the AI did not swap keep the engine's reason.
    const others = (bp: StackBlueprint) => bp.slots.filter((_, i) => i !== at).map(s => s.reason)
    expect(others(out)).toEqual(others(blueprint))
  })

  it('returns the engine blueprint untouched when the server personalised nothing', async () => {
    const answers = makeAnswers()
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    global.fetch = reply({ personalised: false, choices: {} })
    expect(await personaliseBlueprint(answers, blueprint, MOCK_CATALOGUE)).toBe(blueprint)
  })

  it('returns the engine blueprint untouched when the call fails', async () => {
    const answers = makeAnswers()
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch
    expect(await personaliseBlueprint(answers, blueprint, MOCK_CATALOGUE)).toBe(blueprint)
  })
})

describe('parseBlueprintResult', () => {
  const allowed = { 'slot-protein': new Set(['a', 'b']), 'slot-perf': new Set(['c']) }

  it('keeps only choices within each slot allowed options', () => {
    const result = parseBlueprintResult(
      { choices: { 'slot-protein': 'b', 'slot-perf': 'zzz', 'ghost': 'a' } },
      allowed,
    )
    expect(result).toEqual({ choices: { 'slot-protein': 'b' } })
  })

  it('reads the choices from an old-style reply and drops its reasons', () => {
    const result = parseBlueprintResult(
      { choices: { 'slot-protein': 'b' }, reasons: { 'slot-protein': '**Perfect for you**' } },
      allowed,
    )
    expect(result).toEqual({ choices: { 'slot-protein': 'b' } })
    expect(result).not.toHaveProperty('reasons')
  })

  it('returns null when nothing usable came back', () => {
    expect(parseBlueprintResult({ choices: { x: 'y' } }, allowed)).toBeNull()
    expect(parseBlueprintResult(null, allowed)).toBeNull()
  })

  it('returns null for a reply that is only reasons — there is nothing to apply', () => {
    expect(parseBlueprintResult({ reasons: { 'slot-protein': 'Great choice' } }, allowed)).toBeNull()
  })
})
