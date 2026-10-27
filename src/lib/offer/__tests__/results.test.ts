/**
 * The offer as the results page lays it out (plan Phase 4): the core offer,
 * the bonus per depth, and codes against the bonus. What must always hold:
 * the bonus never changes a stack's price, saving or delivery; it only comes
 * with a depth at or over the minimum; the core offer charges what it shows.
 */
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { buildStackBlueprint } from '@/lib/stack-blueprint/factory'
import { quizOffer, quizPerson } from '@/lib/stack-blueprint/offer'
import { calculatePricing, getPricingConfig } from '@/lib/stack-blueprint/pricing'
import { planTiers } from '@/lib/stack-blueprint/tier-plan'
import { defaultAnswers } from '@/lib/quiz-answers'
import type { QuizAnswers } from '@/lib/types'
import { quoteOffer, offerProductFor } from '@/lib/last-chance/economics'
import { DEFAULT_OFFER, type OfferSettings } from '../settings'
import { chooseBonus, chooseHero, costedItemsFor, personFromSnapshot, snapshotPerson } from '../select'
import { PERSONAS } from '@/lib/consult/personas'
import { runStackEngine } from '@/lib/consult/engine'
import { consultOffer } from '@/lib/consult/offer'
import { offerFitFor } from '@/lib/consult/offer-fit'
import { stackMargin } from '../bonus-economics'
import { bonusLineFor, codeOrBonus, coreOffer, tierBonuses, tierDelivered } from '../results'
import { OFFER_COPY } from '../copy'
import { offerCopyRows } from '../review-rows'
import { TODAY, allOn } from './fixtures'

const answers = { ...defaultAnswers, name: 'P', track: 'performance', goals: ['muscle'], trainingFrequency: '3-4x', budget: '50-80', caffeineLevel: 'medium', stimPreference: 'yes', diet: 'mostly-good' } as QuizAnswers
const config = getPricingConfig()
const blueprint = buildStackBlueprint(answers, MOCK_CATALOGUE)

function offerWith(settings: OfferSettings) {
  return quizOffer({ answers, blueprint, catalogue: MOCK_CATALOGUE, settings, today: TODAY })
}

describe('Start here', () => {
  it('is the approved hero, labelled as one, priced as the hero offer prices it', () => {
    const offer = offerWith(allOn())
    expect(offer.hero).not.toBeNull()
    const core = coreOffer({ hero: offer.hero, slots: offer.blueprint.slots, catalogue: MOCK_CATALOGUE, answers, config })!
    expect(core.kind).toBe('hero')
    expect(core.label).toBe('Not the obvious pick')
    expect(core.product.id).toBe(offer.hero!.choice.product.id)
    const quote = quoteOffer(offerProductFor(core.product, core.variant), config)
    expect(core.quote).toEqual(quote)
    expect(core.total).toBe(core.onDeal ? quote.total : quote.normalTotal)
    expect(core.total).toBeCloseTo(core.price + core.delivery, 2)
    // Its claim is the one it was approved to carry, verbatim, or none.
    expect(core.claim?.id ?? null).toBe(offer.hero!.choice.claim?.id ?? null)
  })

  it('is their top pick with the hero switch off', () => {
    const offer = offerWith({ ...allOn(), heroEnabled: false })
    expect(offer.hero).toBeNull()
    const core = coreOffer({ hero: null, slots: offer.blueprint.slots, catalogue: MOCK_CATALOGUE, answers, config })!
    expect(core.kind).toBe('top-pick')
    expect(core.label).toBe('Your top pick')
    expect(core.onDeal).toBe(true)
    expect(core.total).toBe(core.quote.total)
  })

  it('is at its ordinary delivered price once this browser has had the deal', () => {
    const core = coreOffer({ hero: null, slots: blueprint.slots, catalogue: MOCK_CATALOGUE, answers, dealUsed: true, config })!
    expect(core.onDeal).toBe(false)
    expect(core.total).toBe(core.quote.normalTotal)
    expect(core.price).toBe(core.quote.basePrice)
  })

  it('never says "transformational" or that people haven’t heard of it', () => {
    // Every sentence, through the review pack's own rows (which fill in example figures).
    const all = JSON.stringify(offerCopyRows(DEFAULT_OFFER.bonus))
    expect(offerCopyRows(DEFAULT_OFFER.bonus).length).toBeGreaterThanOrEqual(Object.keys(OFFER_COPY).length)
    expect(all).not.toMatch(/transformational|haven.t heard|never heard|most people/i)
    expect(all).not.toMatch(/only today|ends tonight|last chance|hurry/i)
  })
})

describe('the bonus, per depth', () => {
  const settings = allOn()
  const person = quizPerson(answers)
  const tiers = planTiers(offerWith(settings).blueprint, MOCK_CATALOGUE, answers)

  it('never changes a stack’s price, saving or delivery: on or off, the tiers and the pricing are identical', () => {
    const on = offerWith(settings)
    const off = offerWith({ ...settings, bonus: { ...settings.bonus, enabled: false } })
    expect(on.blueprint).toEqual(off.blueprint)
    expect(on.tiers).toEqual(off.tiers)
    for (const t of on.tiers) {
      const bp = { ...on.blueprint, slots: t.slots, level: t.level }
      expect(calculatePricing(bp, MOCK_CATALOGUE, answers, undefined, { level: t.level })).toEqual(
        calculatePricing({ ...off.blueprint, slots: t.slots, level: t.level }, MOCK_CATALOGUE, answers, undefined, { level: t.level }),
      )
      expect(tierDelivered(t, MOCK_CATALOGUE, config)).toBe(tierDelivered(off.tiers.find((x) => x.level === t.level)!, MOCK_CATALOGUE, config))
    }
  })

  it('comes with a depth at or over the minimum, and not under it', () => {
    const tier = tiers[tiers.length - 1]
    const items = costedItemsFor(tier.slots.map((s) => ({ productId: s.selectedProductId, variantId: s.selectedVariantId })), MOCK_CATALOGUE)
    const subtotal = stackMargin(items, null, config).subtotal
    const at = (minSubtotal: number) => chooseBonus({ settings: allOn({ minSubtotal }), catalogue: MOCK_CATALOGUE, config }, person, { level: tier.level, items })
    expect(at(subtotal - 1).choice).not.toBeNull() // over
    expect(at(subtotal).choice).not.toBeNull() // at
    expect(at(subtotal + 1)).toEqual({ choice: null, blocked: 'minimum' }) // under
  })

  it('says what would qualify on a depth under the minimum, and nothing when it is switched off', () => {
    const small = tiers[0]
    const big = tiers[tiers.length - 1]
    const subtotalOf = (t: typeof small) =>
      stackMargin(costedItemsFor(t.slots.map((s) => ({ productId: s.selectedProductId, variantId: s.selectedVariantId })), MOCK_CATALOGUE), null, config).subtotal
    const min = Math.round(((subtotalOf(small) + subtotalOf(big)) / 2) * 100) / 100
    const between = allOn({ minSubtotal: min })
    const bonuses = tierBonuses({ settings: between, catalogue: MOCK_CATALOGUE, config }, person, tiers)
    expect(bonuses[small.level]?.blocked).toBe('minimum')
    const line = bonusLineFor(small.level, bonuses, between.bonus)
    expect(line).toMatchObject({ kind: 'from', minimum: min })
    expect(bonusLineFor(big.level, bonuses, between.bonus)).toMatchObject({ kind: 'comes-with' })
    const off = tierBonuses({ settings: DEFAULT_OFFER, catalogue: MOCK_CATALOGUE, config }, person, tiers)
    for (const t of tiers) expect(bonusLineFor(t.level, off, DEFAULT_OFFER.bonus)).toBeNull()
  })

  it('is never offered without a person to judge it against', () => {
    const none = tierBonuses({ settings, catalogue: MOCK_CATALOGUE, config }, null, tiers)
    for (const t of tiers) expect(none[t.level]?.choice).toBeNull()
  })

  it('carries a person over as data and decides the same way', () => {
    const snap = snapshotPerson(person, MOCK_CATALOGUE, (p) => p.swapGroup)
    const again = personFromSnapshot(snap)
    for (const p of MOCK_CATALOGUE) {
      expect(again.keepOut(p)).toBe(person.keepOut(p))
      expect(again.fit(p)).toBe(person.fit(p))
    }
    expect(again.keepOut({ ...MOCK_CATALOGUE[0], id: 'never-seen' })).not.toBeNull()
  })
})

describe('a code, or the bonus', () => {
  it('gives whichever is worth more, the bonus on a tie', () => {
    expect(codeOrBonus('better-of', 12, 9.99)).toBe('code')
    expect(codeOrBonus('better-of', 9.99, 9.99)).toBe('bonus')
    expect(codeOrBonus('better-of', 3, 9.99)).toBe('bonus')
    expect(codeOrBonus('code-cancels-bonus', 0.5, 9.99)).toBe('code')
  })
})

describe('the consult, carried to the results page', () => {
  it('keeps out what the circuit check ruled out, and the page picks the hero the consult would', () => {
    const p06 = PERSONAS.find((p) => p.id === 'p06')!
    const engine = runStackEngine(p06.answers, MOCK_CATALOGUE)
    const person = personFromSnapshot(offerFitFor(p06.answers, engine, MOCK_CATALOGUE))
    expect(person.keepOut(MOCK_CATALOGUE.find((p) => p.id === 'chrgd-omega-3')!)).not.toBeNull()
    const settings = allOn()
    const direct = consultOffer({ answers: p06.answers, engine, catalogue: MOCK_CATALOGUE, settings, today: TODAY })
    const fromSnap = chooseHero({ settings, catalogue: MOCK_CATALOGUE, today: TODAY }, person)
    expect(fromSnap?.product.id ?? null).toBe(direct.hero?.choice.product.id ?? null)
  })
})
