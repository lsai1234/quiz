/**
 * Choosing the hero and the bonus, against both engines (plan Phase 3).
 *
 * What must always hold: neither ever breaks an exclusion, the bonus is never
 * already in its tier, the margin floor holds, every fallback falls back, and
 * the same answers give the same result.
 */
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { runStackEngine } from '@/lib/consult/engine'
import { consultOffer } from '@/lib/consult/offer'
import { ingredientsOf, familyOf } from '@/lib/consult/knowledge'
import { PERSONAS } from '@/lib/consult/personas'
import { stopReason } from '@/lib/consult/circuit'
import { buildStackBlueprint } from '@/lib/stack-blueprint/factory'
import { quizOffer, quizPerson } from '@/lib/stack-blueprint/offer'
import { planTiers } from '@/lib/stack-blueprint/tier-plan'
import { defaultAnswers } from '@/lib/quiz-answers'
import type { QuizAnswers } from '@/lib/types'
import { DEFAULT_OFFER } from '../settings'
import { chooseBonus, chooseHero, heroFirst, heroReason, type PersonFit } from '../select'
import { costedItem, stackMargin } from '../bonus-economics'
import { TODAY, allOn, approved } from './fixtures'

const live = PERSONAS.filter((p) => !stopReason(p.answers))
const byId = new Map(MOCK_CATALOGUE.map((p) => [p.id, p]))

describe('the consult', () => {
  it.each(live.map((p) => [p.id, p] as const))('%s: hero and bonus clear every exclusion, and the tiers hold', (_, persona) => {
    const engine = runStackEngine(persona.answers, MOCK_CATALOGUE)
    const offer = consultOffer({ answers: persona.answers, engine, catalogue: MOCK_CATALOGUE, settings: allOn(), today: TODAY })
    const excluded = new Set(engine.excludedIngredients)
    const clears = (id: string) => [...ingredientsOf(byId.get(id)!)].every((i) => !excluded.has(i))

    if (offer.hero) {
      const id = offer.hero.choice.product.id
      expect(clears(id)).toBe(true)
      for (const t of ['essentials', 'standard', 'complete'] as const) {
        expect(offer.tiers[t][0]).toBe(id)
        expect(offer.tiers[t].length).toBe(engine.tiers[t].length)
        const families = offer.tiers[t].map((x) => familyOf(byId.get(x)!))
        expect(new Set(families).size).toBe(families.length)
      }
    } else {
      expect(offer.tiers).toEqual(engine.tiers)
    }
    for (const t of ['essentials', 'standard', 'complete'] as const) {
      const b = offer.bonuses[t].choice
      if (!b) continue
      expect(offer.tiers[t]).not.toContain(b.product.id)
      expect(clears(b.product.id)).toBe(true)
      expect(b.contributionWith).toBeGreaterThanOrEqual(b.floor)
    }
  })

  it('never makes fish oil the hero, or the bonus, for someone on blood thinners', () => {
    const p06 = PERSONAS.find((p) => p.id === 'p06')!
    const engine = runStackEngine(p06.answers, MOCK_CATALOGUE)
    const offer = consultOffer({ answers: p06.answers, engine, catalogue: MOCK_CATALOGUE, settings: allOn(), today: TODAY })
    expect(offer.hero?.choice.product.id).not.toBe('chrgd-omega-3')
    for (const b of Object.values(offer.bonuses)) expect(b.choice?.product.id).not.toBe('chrgd-omega-3')
    expect(Object.values(offer.bonuses).some((b) => b.choice?.product.id === 'chrgd-vitamin-d3-k2')).toBe(false)
  })

  it('leaves everything as the engine made it with the switches off', () => {
    for (const persona of live) {
      const engine = runStackEngine(persona.answers, MOCK_CATALOGUE)
      const offer = consultOffer({ answers: persona.answers, engine, catalogue: MOCK_CATALOGUE, settings: DEFAULT_OFFER, today: TODAY })
      expect(offer.hero).toBeNull()
      expect(offer.tiers).toBe(engine.tiers)
      expect(Object.values(offer.bonuses).every((b) => b.choice === null && b.blocked === 'off')).toBe(true)
    }
  })

  it('gives the same hero and bonus for the same answers, whatever order the catalogue arrives in', () => {
    for (const persona of live.slice(0, 12)) {
      const engine = runStackEngine(persona.answers, MOCK_CATALOGUE)
      const run = (catalogue: CatalogueProduct[]) => {
        const o = consultOffer({ answers: persona.answers, engine, catalogue, settings: allOn(), today: TODAY })
        return JSON.stringify({ hero: o.hero?.choice.product.id ?? null, tiers: o.tiers, bonus: Object.values(o.bonuses).map((b) => b.choice?.product.id ?? null) })
      }
      expect(run([...MOCK_CATALOGUE].reverse())).toBe(run(MOCK_CATALOGUE))
    }
  })
})

const quiz = (o: Partial<QuizAnswers>): QuizAnswers => ({ ...defaultAnswers, name: 'P', track: 'performance', goals: ['muscle'], trainingFrequency: '3-4x', budget: '50-80', caffeineLevel: 'medium', stimPreference: 'yes', diet: 'mostly-good', ...o }) as QuizAnswers

const QUIZ_PEOPLE: [string, QuizAnswers][] = [
  ['muscle', quiz({})],
  ['vegan, no caffeine', quiz({ lifestyle: ['vegan'], caffeineLevel: 'none', stimPreference: 'no' })],
  ['pregnant (safety flag)', quiz({ track: 'wellbeing', goals: ['sleep-better', 'less-stress'], safetyFlags: ['pregnancy'], healthDataConsent: { accepted: true, version: '2026-08-30', at: '2026-10-01T00:00:00Z' } })],
  ['already takes creatine and omega-3', quiz({ currentSupplements: ['creatine', 'omega-3'] })],
  ['stress and sleep', quiz({ track: 'wellbeing', goals: ['less-stress', 'sleep-better'], trainingFrequency: null })],
]

describe('the quiz', () => {
  it.each(QUIZ_PEOPLE)('%s: hero and bonus clear every exclusion, and the hero leads every depth', (_, answers) => {
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    const offer = quizOffer({ answers, blueprint, catalogue: MOCK_CATALOGUE, settings: allOn(), today: TODAY })
    const person = quizPerson(answers)
    if (offer.hero) {
      const id = offer.hero.choice.product.id
      expect(person.keepOut(offer.hero.choice.product)).toBeNull()
      for (const t of offer.tiers) expect(t.slots.map((s) => s.selectedProductId)).toContain(id)
      expect(offer.blueprint.slots[0].selectedProductId).toBe(id)
      const kinds = offer.blueprint.slots.map((s) => s.swapGroup)
      expect(kinds.filter((k) => k === offer.hero!.choice.product.swapGroup)).toHaveLength(1)
    }
    for (const t of offer.tiers) {
      const b = offer.bonuses[t.level].choice
      if (!b) continue
      expect(t.slots.map((s) => s.selectedProductId)).not.toContain(b.product.id)
      expect(person.keepOut(b.product)).toBeNull()
      expect(b.contributionWith).toBeGreaterThanOrEqual(b.floor)
    }
  })

  it('never offers a stimulant to someone who said no to caffeine, or a non-vegan product to a vegan', () => {
    const answers = QUIZ_PEOPLE[1][1]
    const offer = quizOffer({ answers, blueprint: buildStackBlueprint(answers, MOCK_CATALOGUE), catalogue: MOCK_CATALOGUE, settings: allOn(), today: TODAY })
    const all = [offer.hero?.choice.product, ...Object.values(offer.bonuses).map((b) => b.choice?.product)].filter(Boolean) as CatalogueProduct[]
    for (const p of all) {
      expect(p.hasStimulants).toBe(false)
      expect(p.dietaryTags).toContain('vegan')
    }
  })

  it('leaves the blueprint and the tiers exactly as they were with the switches off', () => {
    for (const [, answers] of QUIZ_PEOPLE) {
      const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
      const offer = quizOffer({ answers, blueprint, catalogue: MOCK_CATALOGUE, settings: DEFAULT_OFFER, today: TODAY })
      expect(offer.hero).toBeNull()
      expect(offer.blueprint).toBe(blueprint)
      expect(offer.tiers).toEqual(planTiers(blueprint, MOCK_CATALOGUE, answers))
      expect(Object.values(offer.bonuses).every((b) => b.choice === null)).toBe(true)
    }
  })

  it('is the same for the same answers', () => {
    const answers = QUIZ_PEOPLE[0][1]
    const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)
    const run = () => {
      const o = quizOffer({ answers, blueprint, catalogue: MOCK_CATALOGUE, settings: allOn(), today: TODAY })
      return JSON.stringify({ hero: o.hero?.choice.product.id, slots: o.blueprint.slots.map((s) => s.selectedProductId), bonus: Object.values(o.bonuses).map((b) => b.choice?.product.id ?? null) })
    }
    expect(run()).toBe(run())
  })
})

describe('the fallbacks', () => {
  const everyone: PersonFit = { keepOut: () => null, fit: () => 1 }
  const nobody: PersonFit = { keepOut: () => 'kept out', fit: () => 1 }
  const tier = (ids: string[]) => ({ level: 'complete' as const, items: ids.map((id) => costedItem(byId.get(id)!)!) })
  const BIG = ['chrgd-whey-protein', 'chrgd-creatine', 'chrgd-pre-workout', 'chrgd-bcaa', 'chrgd-clear-whey']

  it('has no hero when the switch is off, nothing is approved, nothing fits, or a check is missing', () => {
    const inputs = (settings = allOn()) => ({ settings, catalogue: MOCK_CATALOGUE, today: TODAY })
    expect(chooseHero(inputs(), everyone)).not.toBeNull()
    expect(chooseHero(inputs({ ...allOn(), heroEnabled: false }), everyone)).toBeNull()
    expect(chooseHero(inputs({ ...allOn(), heroes: {} }), everyone)).toBeNull()
    expect(chooseHero(inputs(), nobody)).toBeNull()
    expect(chooseHero(inputs(), { keepOut: () => null, fit: () => 0 })).toBeNull()
    const gaps = { ...allOn(), heroes: Object.fromEntries(Object.entries(allOn().heroes).map(([id, a]) => [id, { ...a, safetyReviewed: false }])) }
    expect(chooseHero(inputs(gaps), everyone)).toBeNull()
  })

  it('has no bonus when off, on a tier that does not qualify, under the minimum, below the floor, or when all of it is already in the tier', () => {
    const inputs = (settings = allOn()) => ({ settings, catalogue: MOCK_CATALOGUE, today: TODAY })
    expect(chooseBonus(inputs(), everyone, tier(BIG)).choice).not.toBeNull()
    expect(chooseBonus(inputs({ ...allOn(), bonus: { ...allOn().bonus, enabled: false } }), everyone, tier(BIG)).blocked).toBe('off')
    expect(chooseBonus(inputs(allOn({ tiers: ['essentials'] })), everyone, tier(BIG)).blocked).toBe('tier')
    expect(chooseBonus(inputs(allOn({ minSubtotal: 10_000 })), everyone, tier(BIG)).blocked).toBe('minimum')
    expect(chooseBonus(inputs(allOn({ floorPounds: 1_000 })), everyone, tier(BIG)).blocked).toBe('margin')
    expect(chooseBonus(inputs(allOn({ pool: ['chrgd-creatine'] })), everyone, tier(BIG)).blocked).toBe('none-fits')
    expect(chooseBonus(inputs(), nobody, tier(BIG)).blocked).toBe('none-fits')
  })

  it('keeps the margin floor: the order with the bonus in it always clears it', () => {
    const settings = allOn({ floorPounds: 0, floorPct: 0.18 })
    const b = chooseBonus({ settings, catalogue: MOCK_CATALOGUE, today: TODAY }, everyone, tier(BIG)).choice
    if (b) {
      const m = stackMargin(tier(BIG).items, b.item)
      expect(m.contribution).toBeGreaterThanOrEqual(0.18 * m.netRevenue - 0.01)
    }
  })

  it('breaks a tie on fit with the lower cost to us', () => {
    const b = chooseBonus({ settings: allOn(), catalogue: MOCK_CATALOGUE, today: TODAY }, everyone, tier(BIG)).choice!
    // Every product fits equally here, and none has a PowerBody cost on file, so
    // the cost to us is the estimate from the shelf price: the cheapest wins.
    const costs = allOn().bonus.pool.filter((id) => !BIG.includes(id)).map((id) => ({ id, price: byId.get(id)!.basePrice }))
    expect(b.product.id).toBe(costs.sort((x, y) => x.price - y.price || x.id.localeCompare(y.id))[0].id)
  })
})

describe('the hero reason', () => {
  const hero = (id: string) => chooseHero({ settings: { ...allOn(), heroes: { [id]: approved(id) } }, catalogue: MOCK_CATALOGUE, today: TODAY }, { keepOut: () => null, fit: () => 1 })!

  it('names a goal only where the goal-to-claim map backs the claim it was approved for', () => {
    const r = heroReason(hero('chrgd-clear-whey'), ['muscle'])
    expect(r.kind).toBe('goal')
    expect(r.line).toBe('You said you want to build muscle.')
    expect(r.claim?.id).toBe(approved('chrgd-clear-whey').claimId)
  })

  it('names no goal for a kind with no claim, and carries no wording', () => {
    const r = heroReason(hero('chrgd-ashwagandha'), ['less-stress', 'muscle'])
    expect(r).toEqual({ line: null, kind: null, claim: null })
    expect(heroReason(hero('chrgd-ashwagandha'), ['less-stress'], 'You train 3–4 times a week.')).toMatchObject({ kind: 'answer', claim: null })
  })
})

it('heroFirst moves or adds the hero, and drops what it stands in for', () => {
  expect(heroFirst(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c'])
  expect(heroFirst(['a', 'b', 'c'], 'x', (id) => id === 'c')).toEqual(['x', 'a', 'b'])
})
