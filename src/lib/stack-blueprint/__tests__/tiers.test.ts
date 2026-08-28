/**
 * Price-banded depth tiers. The reveal builds the full stack once and offers
 * Essentials/Balanced/Complete as nested selections from it, each filled to its
 * own MONTHLY SUBSCRIPTION price band rather than to a fixed product count.
 *
 * These lock what the results screen relies on: nesting, the bands themselves,
 * distinctness, and that the price shown is computed by the same
 * `calculatePricing` the checkout charges through (parity).
 */
import { buildStackBlueprint } from '../factory'
import { planTiers, tierPlanFor } from '../tier-plan'
import { calculatePricing, PRICING_CONFIG } from '../pricing'
import { addBoosterSlot } from '../helpers'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import { TIER_ORDER, TIER_PRICE_BANDS, TIER_SIZE_BANDS, TIER_MIN_STEP } from '@/lib/quiz-core'
import type { QuizAnswers, StackLevel } from '@/lib/types'
import type { StackSlotEntry } from '../types'

function answers(o: Partial<QuizAnswers> = {}): QuizAnswers {
  return {
    name: 'P', track: 'performance', drinksMode: false, drinksPerDay: null,
    dailyDrinks: null, drinkVariety: null, workoutAddOns: [], primaryGoal: null,
    asNeeded: {}, ageBracket: '25-34', exactAge: null, gender: 'male',
    goals: ['muscle', 'energy'], trainingFrequency: '5-6x', trainingType: ['strength'],
    lifestyle: [], diet: 'mostly-good', currentSupplements: [], currentVitamins: [],
    tryOurs: [], wellbeingAnswers: {}, dynamicAnswers: {},
    caffeineLevel: 'high', budget: null, stackPreference: null,
    trainingExperience: 'experienced', trainingFocus: 'hypertrophy', stimPreference: 'yes',
    trainingTime: 'morning', ...o,
  }
}

/** A spread of real quiz shapes — both tracks, every archetype. */
const WELLBEING = { track: 'wellbeing' as const, trainingFrequency: null, trainingType: [] }
const PROFILES: [string, Partial<QuizAnswers>][] = [
  ['muscle + energy', {}],
  ['muscle only', { goals: ['muscle'] }],
  ['bulking', { goals: ['bulking', 'muscle'] }],
  ['cutting', { goals: ['cutting', 'energy'] }],
  ['endurance', { goals: ['performance', 'recovery'] }],
  ['hydration + focus', { goals: ['hydration', 'focus'] }],
  ['light training', { goals: ['energy', 'focus'], trainingFrequency: '1-2x' }],
  ['sleep + stress', { ...WELLBEING, goals: ['sleep-better', 'less-stress'] }],
  ['general health', { ...WELLBEING, goals: ['health'] }],
  ['immune + gut', { ...WELLBEING, goals: ['immune', 'gut-health'] }],
  ['menopause', { ...WELLBEING, gender: 'female', goals: ['menopause', 'sleep-better'] }],
  ['skin, hair & nails', { ...WELLBEING, gender: 'female', goals: ['skin-hair-nails'] }],
]

const plansFor = (o: Partial<QuizAnswers> = {}) => {
  const a = answers(o)
  return { a, plans: planTiers(buildStackBlueprint(a, MOCK_CATALOGUE), MOCK_CATALOGUE, a) }
}

describe('price-banded tiers', () => {
  const { a, plans } = plansFor()
  const full = buildStackBlueprint(a, MOCK_CATALOGUE)

  it('the full (no-budget) build is the complete stack (up to 7 slots)', () => {
    expect(full.slots.length).toBeGreaterThan(3)
    expect(full.slots.length).toBeLessThanOrEqual(7)
  })

  it('each depth contains everything the depth below it has', () => {
    for (let i = 1; i < plans.length; i++) {
      const below = plans[i - 1].slots.map((s) => s.slotId)
      const above = new Set(plans[i].slots.map((s) => s.slotId))
      for (const slotId of below) expect(above.has(slotId)).toBe(true)
      expect(plans[i].slots.length).toBeGreaterThan(plans[i - 1].slots.length)
    }
  })

  it('depths are offered cheapest-first, and never two for the same money', () => {
    for (let i = 1; i < plans.length; i++) {
      expect(plans[i].monthly - plans[i - 1].monthly).toBeGreaterThanOrEqual(TIER_MIN_STEP)
      expect(TIER_ORDER.indexOf(plans[i].level)).toBeGreaterThan(TIER_ORDER.indexOf(plans[i - 1].level))
    }
  })

  it('subscribe-&-save rate rises with depth', () => {
    // Read from config rather than hard-coded, so tuning the ladder is a pricing
    // decision rather than a test failure. The PROPERTY — deeper bundle, better
    // rate — is what matters and is what's asserted.
    const rate = (level: StackLevel) =>
      calculatePricing({ ...full, level }, MOCK_CATALOGUE, a, undefined, { level }).subscriptionDiscountPct
    const expected = PRICING_CONFIG.levelSubscriptionDiscount
    expect(rate('essentials')).toBe(expected.essentials * 100)
    expect(rate('performance')).toBe(expected.performance * 100)
    expect(rate('complete')).toBe(expected.complete * 100)
    expect(rate('complete')).toBeGreaterThan(rate('performance'))
    expect(rate('performance')).toBeGreaterThan(rate('essentials'))
  })

  it('parity: a plan prices exactly as the reveal and the checkout price it', () => {
    // The reveal renders `plan.monthly` and checks out `plan.slots` at
    // `plan.level` — the same call, so displayed price and charged price are one
    // number by construction.
    for (const plan of plans) {
      const charged = calculatePricing(
        { ...full, slots: plan.slots, level: plan.level },
        MOCK_CATALOGUE,
        a,
        undefined,
        { level: plan.level },
      )
      expect(plan.monthly).toBe(charged.subscriptionTotal)
      expect(plan.oneOff).toBe(charged.oneOffTotal)
    }
  })
})

describe('the bands hold across every quiz', () => {
  it.each(PROFILES)('%s stays inside its bands', (_name, profile) => {
    const { plans } = plansFor(profile)

    for (const plan of plans) {
      const band = TIER_PRICE_BANDS[plan.level]
      const size = TIER_SIZE_BANDS[plan.level]
      expect(plan.slots.length).toBeGreaterThanOrEqual(size.min)
      expect(plan.slots.length).toBeLessThanOrEqual(size.max)
      if (band.max == null) continue
      // TWO licensed overshoots, and no others. Both are the precedence rule
      // showing up in a price:
      //
      //  · Anchors — the products that MUST be in the stack. A bulking
      //    member's mass builder is £37/month before anything else is added.
      //  · The floor — a depth at its minimum count has spent the band getting
      //    there, and `size.min` outranks `band.max` by design. A £36
      //    two-product Essentials is the right answer; a £32 one-product
      //    Essentials is not.
      //
      // A plan ABOVE its floor has no excuse and must be inside the band.
      const anchorsOnly = plan.slots.filter((s) => s.required)
      const allAnchors = anchorsOnly.length === plan.slots.length && anchorsOnly.length > 0
      const atFloor = plan.slots.length <= size.min
      if (!allAnchors && !atFloor) expect(plan.monthly).toBeLessThanOrEqual(band.max)
    }

    // Deeper always means more products AND more money — a depth that costs
    // less than the one above it in the list would make the list a trap.
    for (let i = 1; i < plans.length; i++) {
      expect(plans[i].slots.length).toBeGreaterThan(plans[i - 1].slots.length)
      expect(plans[i].monthly - plans[i - 1].monthly).toBeGreaterThanOrEqual(TIER_MIN_STEP)
    }
  })

  it('Balanced is the same sort of money whatever the quiz said', () => {
    // The point of the whole exercise: two members comparing notes on the middle
    // option see the same price bracket, not £40 and £88.
    const middles = PROFILES.map(([, profile]) => plansFor(profile).plans)
      .map((plans) => plans.find((p) => p.level === 'performance'))
      .filter((plan): plan is NonNullable<typeof plan> => plan != null)

    expect(middles.length).toBeGreaterThan(PROFILES.length / 2)
    for (const plan of middles) {
      expect(plan.monthly).toBeGreaterThanOrEqual(TIER_PRICE_BANDS.performance.min)
      expect(plan.monthly).toBeLessThanOrEqual(TIER_PRICE_BANDS.performance.max!)
    }
  })

  it('no depth is ever priced above the top band', () => {
    for (const [, profile] of PROFILES) {
      for (const plan of plansFor(profile).plans) {
        // Same two exceptions as above; nothing else may go over the ceiling
        // of the deepest band.
        const forced =
          plan.slots.every((s) => s.required) || plan.slots.length <= TIER_SIZE_BANDS[plan.level].min
        if (!forced) expect(plan.monthly).toBeLessThanOrEqual(TIER_PRICE_BANDS.complete.max!)
      }
    }
  })
})

describe('what a member asked for is never sized out', () => {
  it('keeps a booster the member added in every depth, whatever it costs', () => {
    const a = answers()
    const full = buildStackBlueprint(a, MOCK_CATALOGUE)
    const booster = MOCK_CATALOGUE.find(
      (p) => p.isBoosterEligible && !full.slots.some((s) => s.selectedProductId === p.id),
    )!
    const withBooster = addBoosterSlot(full, {
      slotId: `booster-${booster.id}`,
      slotType: booster.stackSlots[0],
      title: booster.title,
      description: booster.description,
      recommendedProductId: booster.id,
      selectedProductId: booster.id,
      selectedVariantId: booster.variants[0]?.id ?? null,
      required: false,
      canSwap: true,
      swapGroup: booster.swapGroup,
      reason: booster.shortReason,
      confidenceScore: 50,
    })

    const plans = planTiers(withBooster, MOCK_CATALOGUE, a)
    for (const plan of plans) {
      expect(plan.slots.some((s) => s.selectedProductId === booster.id)).toBe(true)
    }
  })
})

describe('tierPlanFor', () => {
  it('resolves a folded depth to the nearest one still on offer', () => {
    const { plans } = plansFor({ ...WELLBEING, gender: 'female', goals: ['menopause', 'sleep-better'] })
    for (const level of TIER_ORDER) {
      const plan = tierPlanFor(plans, level)
      expect(plans).toContain(plan)
      // Never resolves DOWN — a member who asked for more never silently gets less.
      if (!plans.some((p) => p.level === level) && TIER_ORDER.indexOf(plan.level) < TIER_ORDER.indexOf(level)) {
        expect(plan).toBe(plans[plans.length - 1])
      }
    }
  })
})

/**
 * The slots the fill has no choice about, mirroring steps 1 and 2 of
 * `planTiers`: the anchors (`isAnchor` — required, or added by the member), plus
 * the top-ranked slot, which step 1 pins into the cheapest depth so it leads
 * with the pick the engine is most sure of. Nesting carries it into the rest.
 */
function undroppable(plan: { slots: StackSlotEntry[] }, ranked: StackSlotEntry[]): Set<string> {
  const ids = new Set(plan.slots.filter((s) => s.required || s.addedByUser === true).map((s) => s.slotId))
  if (ranked[0]) ids.add(ranked[0].slotId)
  return ids
}

describe('the floors', () => {
  it('no depth is ever below its minimum product count', () => {
    // The assertion whose ABSENCE was the bug. Before the floors, the fill
    // seeded Essentials with "the anchors, or the top-ranked product if there
    // are none", so a member whose top pick happened to be a £30 product was
    // offered a one-product Essentials — inside its band, and reading as a
    // mistake. `general health` did exactly that on this catalogue.
    for (const [, profile] of PROFILES) {
      for (const plan of plansFor(profile).plans) {
        expect(plan.slots.length).toBeGreaterThanOrEqual(TIER_SIZE_BANDS[plan.level].min)
      }
    }
  })

  it('a depth reaches its floor even when the band cannot pay for it', () => {
    // The precedence, on the profile that actually exercises it: a
    // two-product Essentials over £35 beats a one-product Essentials under it.
    const plans = plansFor({ track: 'wellbeing', trainingFrequency: null, trainingType: [], goals: ['health'] }).plans
    const essentials = plans.find((p) => p.level === 'essentials')
    expect(essentials).toBeDefined()
    expect(essentials!.slots.length).toBe(TIER_SIZE_BANDS.essentials.min)
  })

  it('when the band has to give way, it gives way as little as it can', () => {
    // The floor is filled by rank while anything fits the ceiling, and only
    // then by the CHEAPEST product left. Filling that second phase by rank
    // instead put a £60 Balanced inside a £55 band on stacks that had a
    // perfectly good £48 option one place further down — so an overshoot must
    // never be beatable by another product of the same count.
    for (const [, profile] of PROFILES) {
      const { a, plans } = plansFor(profile)
      const full = buildStackBlueprint(a, MOCK_CATALOGUE)
      const ranked = full.slots.slice().sort((x, y) => x.displayOrder - y.displayOrder)
      for (const plan of plans) {
        const band = TIER_PRICE_BANDS[plan.level]
        if (band.max == null || plan.monthly <= band.max) continue
        if (plan.slots.length > TIER_SIZE_BANDS[plan.level].min) continue
        const ids = new Set(plan.slots.map((s) => s.slotId))
        const unused = full.slots.filter((s) => !ids.has(s.slotId))
        // Only the slots the fill was FREE to choose. Anchors are in the stack
        // whatever they cost, and `plan.slots` is display-ordered rather than
        // pick-ordered, so "the last one" is not necessarily the one phase two
        // added — swapping it out would test a stack the fill was never
        // allowed to build.
        const pinned = undroppable(plan, ranked)
        const removable = plan.slots.filter((s) => !pinned.has(s.slotId))
        for (const drop of removable) {
          for (const candidate of unused) {
            const swapped = [...plan.slots.filter((s) => s.slotId !== drop.slotId), candidate]
            const price = calculatePricing(
              { ...full, slots: swapped, level: plan.level },
              MOCK_CATALOGUE, a, undefined, { level: plan.level },
            ).subscriptionTotal
            expect(price).toBeGreaterThanOrEqual(plan.monthly - 0.01)
          }
        }
      }
    }
  })
})

describe('the targets', () => {
  it('Essentials clusters near its target instead of anywhere under the ceiling', () => {
    // What turns a band into a price. Filling to the ceiling gave Essentials a
    // £24–£43 spread across these profiles; aiming at the target narrows it.
    // The assertion is on the SPREAD, not on any single number, because what a
    // member notices is that their friend paid something else.
    const prices = PROFILES.map(([, profile]) => plansFor(profile).plans)
      .map((plans) => plans.find((p) => p.level === 'essentials')?.monthly)
      .filter((p): p is number => p != null)

    expect(prices.length).toBeGreaterThan(PROFILES.length / 2)
    const spread = Math.max(...prices) - Math.min(...prices)
    expect(spread).toBeLessThanOrEqual(25)
  })

  it('the target never reaches past a more relevant product for a cheaper one', () => {
    // Rank decides WHICH product; the target can only end the fill early. So
    // every depth is a rank-ordered prefix of the ranked stack, minus anything
    // that did not fit the ceiling — never a re-sort by price.
    for (const [, profile] of PROFILES) {
      const { a, plans } = plansFor(profile)
      const order = buildStackBlueprint(a, MOCK_CATALOGUE)
        .slots.slice().sort((x, y) => x.displayOrder - y.displayOrder)
        .map((s) => s.slotId)
      for (const plan of plans) {
        const positions = plan.slots.map((s) => order.indexOf(s.slotId))
        expect(positions).toEqual([...positions].sort((x, y) => x - y))
      }
    }
  })
})

describe('folding never produces a depth that breaks its own shape', () => {
  it('every shown depth is inside its own size band', () => {
    // `TIER_MIN_STEP` folding replaces a shallower plan with a deeper one when
    // the two are within a few pounds. The survivor keeps its own level, so it
    // must satisfy THAT level's floor and cap — a fold that left a "Balanced"
    // holding six products would be the shape rule failing silently.
    for (const [, profile] of PROFILES) {
      for (const plan of plansFor(profile).plans) {
        const size = TIER_SIZE_BANDS[plan.level]
        expect(plan.slots.length).toBeGreaterThanOrEqual(size.min)
        expect(plan.slots.length).toBeLessThanOrEqual(size.max)
      }
    }
  })
})
