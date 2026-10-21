import { buildStackBlueprint } from '@/lib/stack-blueprint/factory'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import { ALL_GOALS, type QuizAnswers, type StackIdentity } from '@/lib/types'
import type { BuildSharePayloadOptions } from '../payload'
import { PRODUCT_TYPE_LABELS, productTypeLabel } from '@/lib/catalogue/product-type'
import { buildSharePayload, shortReason } from '../payload'
import { SHARE_PAYLOAD_VERSION } from '../types'

/**
 * The payload builder, run over the stacks the renderer has to survive.
 *
 * These use the real engine and the real catalogue rather than a hand-written
 * blueprint, because the interesting failures are not in the mapping — they are
 * in the shapes the engine actually produces. A stack with nine slots, a
 * wellbeing stack with no training language, a stack whose goals nothing in the
 * catalogue can serve: each of those is a layout the
 * card has to hold, and none of them appear if the fixture is one tidy stack
 * written by hand.
 *
 * The privacy assertions matter more than the mapping ones. A card is a public
 * URL with no expiry, and the single worst outcome for this feature is a
 * safety-screen disclosure reaching it.
 */

function A(o: Partial<QuizAnswers> = {}): QuizAnswers {
  return {
    name: 'Sam Whitlock', track: 'performance', primaryGoal: null,
    asNeeded: {}, ageBracket: '25-34', exactAge: null, gender: 'male',
    safetyFlags: [], weightBand: null, goals: ['health'],
    trainingFrequency: '3-4x', trainingType: [], lifestyle: [], diet: 'mostly-good',
    currentSupplements: [], currentVitamins: [], tryOurs: [],
    wellbeingAnswers: {}, dynamicAnswers: {}, caffeineLevel: 'medium', budget: '50-80',
    stackPreference: 'balanced', trainingExperience: 'intermediate', trainingFocus: null,
    stimPreference: 'yes', trainingTime: null, ...o,
  }
}

const IDENTITY: StackIdentity = {
  name: 'Iron Foundations',
  archetype: 'The Strength Builder',
  description: 'Built around your four sessions a week.',
  focusAreas: ['Performance Output', 'Faster Recovery', 'Daily Energy'],
  routineFitScore: 88,
}

const PERSONAS = {
  essentials: A({ goals: ['health'], budget: 'under-30', stackPreference: 'simple' }),
  complete: A({
    goals: ['muscle', 'energy'], trainingFrequency: '5-6x', trainingType: ['strength'],
    trainingFocus: 'hypertrophy', trainingExperience: 'experienced',
    budget: '80-plus', stackPreference: 'complete', caffeineLevel: 'high',
  }),
  wellbeing: A({
    track: 'wellbeing', goals: ['sleep-better', 'less-stress'], gender: 'female',
    ageBracket: '35-44', trainingFrequency: null, budget: null, stackPreference: null,
  }),
  // A safety-gated build. Every mock persona tried still finds a substitute for
  // its goals — see the hand-built blueprint below for the genuinely-uncovered
  // case — but the gate changes which products are picked, and the card has to
  // hold that shape too.
  gated: A({
    track: 'wellbeing', goals: ['sleep-better', 'less-stress'], gender: 'female',
    safetyFlags: ['pregnancy'], trainingFrequency: null, budget: null, stackPreference: null,
  }),
} as const

const build = (answers: QuizAnswers, opts: BuildSharePayloadOptions = {}) =>
  buildSharePayload(
    buildStackBlueprint(answers, MOCK_CATALOGUE),
    MOCK_CATALOGUE,
    {
      customerName: answers.name,
      now: () => new Date('2026-08-17T09:00:00.000Z'),
      ...opts,
    },
  )

describe('buildSharePayload', () => {
  describe.each(Object.entries(PERSONAS))('%s', (_name, answers) => {
    const payload = build(answers)

    it('produces a renderable card', () => {
      expect(payload.v).toBe(SHARE_PAYLOAD_VERSION)
      expect(payload.stackName.length).toBeGreaterThan(0)
      expect(payload.lineup.length).toBeGreaterThan(0)
      expect(payload.coverage).toHaveLength(4)
    })

    it('names a product on every row, and carries no reason', () => {
      // A slot reason is engine copy saying what a product does, or AI text.
      // Either is a claim nobody reviewed, so the card carries none.
      const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
      const serialised = JSON.stringify(payload)
      for (const row of payload.lineup) {
        expect(row.slot.length).toBeGreaterThan(0)
        expect(row.product.length).toBeGreaterThan(0)
        expect(row.reason).toBe('')
      }
      for (const slot of blueprint.slots) {
        if (slot.reason.trim().length > 12) expect(serialised).not.toContain(slot.reason.trim())
      }
    })

    it('carries no AI identity', () => {
      expect(payload.archetype).toBe('')
      expect(payload.focusAreas).toEqual([])
      expect(payload.fitScore).toBeNull()
    })

    it('scores every coverage axis 0–100', () => {
      for (const axis of payload.coverage) {
        expect(axis.label.length).toBeGreaterThan(0)
        expect(axis.score).toBeGreaterThanOrEqual(0)
        expect(axis.score).toBeLessThanOrEqual(100)
        expect(Number.isInteger(axis.score)).toBe(true)
      }
    })

    it('carries no price, no name and nothing from the safety screen', () => {
      const serialised = JSON.stringify(payload)
      expect(serialised).not.toMatch(/pregnan|breastfeed|medication/i)
      expect(serialised).not.toMatch(/\bSam\b|Whitlock/)
      // No bare price-shaped field. The lineup carries product titles, which is
      // why this checks the keys rather than searching the text for digits.
      const keys = new Set(Object.keys(payload))
      for (const banned of ['price', 'total', 'email', 'age', 'gender', 'safetyFlags']) {
        expect(keys.has(banned)).toBe(false)
      }
    })
  })

  it('gives the complete stack more products than the essentials one', () => {
    // The overflow row ("+2 more") only ever gets exercised if a real persona
    // produces more rows than the card shows, so this guards the fixture as much
    // as the builder.
    expect(build(PERSONAS.complete).lineup.length)
      .toBeGreaterThan(build(PERSONAS.essentials).lineup.length)
  })

  it('marks a goal nothing in the stack targets', () => {
    // Hand-built rather than produced by the engine, and that is itself the
    // finding: across every safety-gated persona tried, the engine substitutes
    // something and `unmetGoals` comes back empty on the mock catalogue. The
    // uncovered case is still reachable in production the moment the real
    // catalogue is thinner than the mock one — which is exactly when a card
    // claiming full coverage would be a lie.
    const blueprint = buildStackBlueprint(PERSONAS.wellbeing, MOCK_CATALOGUE)
    const inStack = blueprint.slots
      .map((s) => MOCK_CATALOGUE.find((p) => p.id === s.selectedProductId)!)
    const orphan = ALL_GOALS.find((g) => !inStack.some((p) => p.goals.includes(g)))!
    expect(orphan).toBeDefined()

    const uncovered = buildSharePayload(
      { ...blueprint, primaryGoal: orphan, secondaryGoals: [], unmetGoals: [orphan] },
      MOCK_CATALOGUE,
      { customerName: 'Sam' },
    )

    const axis = uncovered.coverage[0]
    expect(axis.targeted).toBe(false)
    // And the reason `targeted` has to exist: the score alone does not say this.
    // `stackStatScore` gives every product a baseline on every axis, so a goal
    // nothing addresses still lands around a third of the way up the bar.
    expect(axis.score).toBeGreaterThan(20)
  })

  it('marks the axes the stack does serve', () => {
    const payload = build(PERSONAS.complete)
    expect(payload.coverage.some((c) => c.targeted)).toBe(true)
  })

  it('leads with the engine’s stack name, the one the results page shows', () => {
    // One stack, one name: the You scene, the Stack scene and the card agree.
    const blueprint = buildStackBlueprint(PERSONAS.wellbeing, MOCK_CATALOGUE)
    expect(build(PERSONAS.wellbeing).stackName).toBe(blueprint.stackName)
  })

  it('ignores an AI identity passed the old way', () => {
    // The four-argument form still compiles for older callers. The identity in
    // it is not read: not its name, archetype, focus areas or fit score.
    const blueprint = buildStackBlueprint(PERSONAS.complete, MOCK_CATALOGUE)
    const payload = buildSharePayload(blueprint, IDENTITY, MOCK_CATALOGUE, {
      customerName: 'Sam Whitlock',
      showFirstName: true,
      code: 'sarah20',
    })
    expect(payload.stackName).toBe(blueprint.stackName)
    expect(payload.archetype).toBe('')
    expect(payload.focusAreas).toEqual([])
    expect(payload.fitScore).toBeNull()
    expect(payload.firstName).toBe('Sam')
    expect(payload.code).toBe('SARAH20')
    expect(payload.lineup.length).toBe(build(PERSONAS.complete).lineup.length)
    expect(JSON.stringify(payload)).not.toMatch(/Iron Foundations|Strength Builder|Faster Recovery/)
  })

  describe('the opt-in first name', () => {
    it('is absent even though the builder knows the name', () => {
      // Showing it is a separate decision that defaults off.
      expect(build(PERSONAS.essentials).firstName).toBeUndefined()
    })

    it('is the first name only, never the full one', () => {
      expect(build(PERSONAS.essentials, { showFirstName: true }).firstName).toBe('Sam')
    })

    it('stays absent when there is no name to show', () => {
      expect(build(PERSONAS.essentials, { showFirstName: true, customerName: '   ' }).firstName)
        .toBeUndefined()
    })
  })

  it('never carries the name the engine writes into its reasons', () => {
    // `factory.ts` addresses personalised reasons "For Sam: …". The card has no
    // reasons any more, so the name cannot arrive that way.
    const raw = buildStackBlueprint(PERSONAS.wellbeing, MOCK_CATALOGUE)
    expect(raw.slots.some((s) => /^For Sam:/.test(s.reason))).toBe(true)
    expect(JSON.stringify(build(PERSONAS.wellbeing))).not.toMatch(/\bSam\b/)
  })

  it('strips the name even when the reason was not written by the engine', () => {
    // The AI personalisation pass is unreviewed model output and can address
    // someone however it likes, so the redaction is not tied to one prefix.
    expect(shortReason("Sam's evening magnesium for restful sleep", 7, 'Sam Whitlock'))
      .toBe('Evening magnesium for restful sleep')
    expect(shortReason('Chosen for Sam because you train late', 7, 'Sam'))
      .toBe('Chosen for because you train late')
  })

  it('normalises the code to the form printed on the card', () => {
    expect(build(PERSONAS.essentials, { code: ' sarah20 ' }).code).toBe('SARAH20')
    expect(build(PERSONAS.essentials).code).toBeUndefined()
  })

  it('orders the lineup the way the results screen does', () => {
    const blueprint = buildStackBlueprint(PERSONAS.complete, MOCK_CATALOGUE)
    const expected = blueprint.slots
      .slice()
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((s) => productTypeLabel(MOCK_CATALOGUE.find((p) => p.id === s.selectedProductId)))
    expect(build(PERSONAS.complete).lineup.map((r) => r.slot)).toEqual(expected)
  })

  it.each(Object.entries(PERSONAS))('labels every %s row with a product type, never a slot title', (_name, answers) => {
    // A slot title names a benefit ("Immune Support", "Sleep"); printed beside
    // a product on a public card, that is a health claim.
    const types = new Set(Object.values(PRODUCT_TYPE_LABELS))
    const benefitTitles = buildStackBlueprint(answers, MOCK_CATALOGUE).slots
      .map((s) => s.title)
      .filter((t) => !types.has(t))
    for (const row of build(answers).lineup) {
      expect(types).toContain(row.slot)
      expect(benefitTitles).not.toContain(row.slot)
    }
  })

  it('freezes the moment it was shared', () => {
    expect(build(PERSONAS.essentials).createdAt).toBe('2026-08-17T09:00:00.000Z')
  })
})

describe('shortReason', () => {
  it('prefers the first clause when there is one', () => {
    expect(shortReason('Keeps you hydrated and prevents cramps — especially useful in long or sweaty sessions.'))
      .toBe('Keeps you hydrated and prevents cramps')
    expect(shortReason('Proven to build strength and power — take it daily to see results.'))
      .toBe('Proven to build strength and power')
  })

  it('leaves a nine-word clause whole', () => {
    expect(shortReason('Fast-absorbing protein to build and repair muscle after training.'))
      .toBe('Fast-absorbing protein to build and repair muscle after training')
  })

  it('falls back to a word cap when a clause runs past the budget', () => {
    expect(shortReason('Fast-absorbing protein to build and repair muscle after every single session.'))
      .toBe('Fast-absorbing protein to build and repair muscle after every')
  })

  it('never ends on a dangling word', () => {
    // At a seven-word budget this cuts to "…blood flow before", which reads as a
    // truncation bug on a card. The budget is passed explicitly because the
    // default is nine, where this particular string no longer truncates at all.
    expect(shortReason('Boosts energy, focus and blood flow before training.', 7))
      .toBe('Boosts energy, focus and blood flow')
  })

  it('skips a leading fragment that says nothing on its own', () => {
    // "Magnesium" is one word — an address or a label, not a reason — so the
    // clause after it wins. The row already shows the product's name anyway.
    expect(shortReason('Magnesium — supports muscle function and restful sleep every night'))
      .toBe('Supports muscle function and restful sleep every night')
  })

  it('gives nothing back when the whole string was an address', () => {
    // "Chosen for Sam" with no clause after it. Returning "Chosen for" would put
    // a broken sentence on a public card; the builder falls back to the
    // catalogue's own copy instead.
    expect(shortReason('Chosen for Sam', 9, 'Sam Whitlock')).toBe('')
  })

  it('leaves a reason that already fits alone', () => {
    expect(shortReason('Supports everyday immune health.')).toBe('Supports everyday immune health')
  })

  it('survives an empty reason', () => {
    expect(shortReason('')).toBe('')
    expect(shortReason('   ')).toBe('')
  })
})
