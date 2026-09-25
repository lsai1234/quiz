import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { circuitOutcome } from '../circuit'
import { CAFFEINE_CEILING, runStackEngine, scoreNeeds } from '../engine'
import { ingredientsOf } from '../knowledge'
import { chargeProfile } from '../profile'
import { EMPTY_ANSWERS, type ConsultAnswers } from '../types'
import { applyPlaceholder, flowReducer, initialFlow, SCENES, type FlowState } from '../flow'

const CONSENT = { accepted: true as const, version: 'test', at: '2026-09-25T00:00:00Z' }

/** A realistic, fully answered consult. Override what a test is about. */
function persona(over: Partial<ConsultAnswers> = {}): ConsultAnswers {
  return {
    ...EMPTY_ANSWERS,
    route: 'deep',
    goals: ['performance', 'sleep'],
    age: '35-44',
    sex: 'male',
    week: ['gym', 'rest', 'gym', 'rest', 'gym', 'cardio', 'sport'],
    intensity: 'steady',
    energy: 4,
    sleep: { bed: 23 * 60, wake: 6 * 60, quality: 'broken' },
    daylight: 'hardly',
    caffeine: { coffee: 2, tea: 1, energy: 0 },
    plate: ['red-meat', 'poultry', 'eggs', 'fruit'],
    body: [],
    shelf: [],
    circuit: { flags: [], none: true },
    healthConsent: CONSENT,
    ...over,
  }
}

const byId = new Map(MOCK_CATALOGUE.map((p) => [p.id, p]))
const products = (ids: string[]) => ids.map((id) => byId.get(id)!)

describe('H3 circuit outcomes', () => {
  it.each([
    [['pregnancy'], 'pregnancy'],
    [['kidney-liver'], 'kidney-liver'],
    [['heart', 'pregnancy'], 'pregnancy'],
  ] as const)('stops for %j', (flags, reason) => {
    expect(circuitOutcome({ circuit: { flags: [...flags], none: false }, healthConsent: CONSENT })).toEqual({ kind: 'stop', reason })
  })

  it('stops when consent is declined — no stack without the safety check', () => {
    expect(circuitOutcome({ circuit: null, healthConsent: null })).toEqual({ kind: 'stop', reason: 'declined' })
  })

  it('filters for blood thinners, with a pharmacist note', () => {
    const o = circuitOutcome({ circuit: { flags: ['blood-thinners'], none: false }, healthConsent: CONSENT })
    expect(o).toMatchObject({ kind: 'go', exclude: ['fish-oil', 'ginkgo', 'turmeric', 'vitamin-k'], pharmacistNote: true })
  })

  it('filters stimulants for a heart condition, without a pharmacist note', () => {
    expect(circuitOutcome({ circuit: { flags: ['heart'], none: false }, healthConsent: CONSENT })).toMatchObject({
      kind: 'go',
      exclude: ['caffeine', 'stimulant'],
      pharmacistNote: false,
    })
  })

  it('goes with nothing excluded for "none of these"', () => {
    expect(circuitOutcome({ circuit: { flags: [], none: true }, healthConsent: CONSENT })).toMatchObject({ kind: 'go', exclude: [], pharmacistNote: false })
  })

  it('never reaches analysis or the results page after a stop', () => {
    let s = initialFlow('c', 0, { route: 'deep' })
    for (let guard = 0; guard < 20 && s.phase === 'scenes'; guard++) {
      const def = SCENES.find((d) => d.id === s.sceneId)!
      const opt = def.placeholder?.options[0]
      if (opt) s = flowReducer(s, { type: 'answer', patch: applyPlaceholder(opt, s.answers) })
      if (s.sceneId === 'circuit') {
        s = flowReducer(s, { type: 'answer', patch: { healthConsent: CONSENT, circuit: { flags: ['pregnancy'], none: false } } })
      }
      s = flowReducer(s, { type: 'next' })
    }
    expect(s.phase).toBe('stop')
    expect(flowReducer(s, { type: 'next' }).phase).toBe('stop')
    expect(() => runStackEngine(s.answers, MOCK_CATALOGUE)).toThrow(/circuit stop/)
  })

  it('stops on decline and keeps nothing of the health answers', () => {
    let s: FlowState = { ...initialFlow('c', 0, { route: 'deep' }), sceneId: 'circuit' }
    s = flowReducer(s, { type: 'answer', patch: { healthConsent: CONSENT, circuit: { flags: ['heart'], none: false } } })
    s = flowReducer(s, { type: 'decline' })
    expect(s.phase).toBe('stop')
    expect(s.answers.circuit).toBeNull()
    expect(s.answers.healthConsent).toBeNull()
  })
})

describe('H4 stack engine', () => {
  it('gives the same three lists for the same answers, every time', () => {
    const a = runStackEngine(persona(), MOCK_CATALOGUE)
    const b = runStackEngine(persona(), [...MOCK_CATALOGUE].reverse())
    expect(b.tiers).toEqual(a.tiers)
    expect(b.ranked).toEqual(a.ranked)
  })

  it('builds nested tiers: Essentials 3, Standard 5, Complete 7–8', () => {
    const { tiers } = runStackEngine(persona(), MOCK_CATALOGUE)
    expect(tiers.essentials).toHaveLength(3)
    expect(tiers.standard).toHaveLength(5)
    expect(tiers.complete.length).toBeGreaterThanOrEqual(7)
    expect(tiers.complete.length).toBeLessThanOrEqual(8)
    expect(tiers.standard.slice(0, 3)).toEqual(tiers.essentials)
    expect(tiers.complete.slice(0, 5)).toEqual(tiers.standard)
  })

  it('weights goals by priority: goal 1 counts ×3, goal 2 ×2', () => {
    const perfFirst = scoreNeeds(persona({ goals: ['performance', 'sleep'] }))
    const sleepFirst = scoreNeeds(persona({ goals: ['sleep', 'performance'] }))
    expect(perfFirst.protein.total).toBeGreaterThan(sleepFirst.protein.total)
    expect(sleepFirst.sleep.total).toBeGreaterThan(perfFirst.sleep.total)
  })

  it('adds 4 to low-sun for "hardly ever" daylight', () => {
    const hardly = scoreNeeds(persona({ goals: ['focus'], age: '25-34', daylight: 'hardly' }))
    const daily = scoreNeeds(persona({ goals: ['focus'], age: '25-34', daylight: 'daily' }))
    expect(hardly['low-sun'].total - daily['low-sun'].total).toBe(4)
  })

  it('adds to protein for two or more gym days', () => {
    const two = scoreNeeds(persona({ goals: ['focus'], week: ['gym', 'rest', 'gym', 'rest', 'rest', 'rest', 'rest'] }))
    const none = scoreNeeds(persona({ goals: ['focus'], week: Array(7).fill('rest') }))
    expect(two.protein.total).toBeGreaterThan(none.protein.total)
  })

  it('only ever picks in-stock products from the catalogue', () => {
    const soldOut: CatalogueProduct[] = MOCK_CATALOGUE.map((p) =>
      p.id === 'chrgd-whey-protein' ? { ...p, variants: p.variants.map((v) => ({ ...v, available: false })) } : p,
    )
    const { tiers } = runStackEngine(persona(), soldOut)
    expect(tiers.complete).not.toContain('chrgd-whey-protein')
    for (const id of tiers.complete) expect(byId.has(id)).toBe(true)
  })

  it('keeps blood-thinner exclusions out of every tier', () => {
    const r = runStackEngine(persona({ circuit: { flags: ['blood-thinners'], none: false }, goals: ['ageing', 'focus'] }), MOCK_CATALOGUE)
    for (const p of products(r.tiers.complete)) {
      const ing = ingredientsOf(p)
      for (const banned of ['fish-oil', 'vitamin-k', 'ginkgo', 'turmeric'] as const) expect(ing.has(banned)).toBe(false)
    }
    expect(r.excludedIngredients).toEqual(expect.arrayContaining(['fish-oil', 'vitamin-k']))
    expect(r.flags.pharmacistNote).toBe(true)
    expect(r.notes.some((n) => /Omega-3.*blood thinners/.test(n))).toBe(true)
  })

  it('keeps stimulants out for a heart condition', () => {
    const r = runStackEngine(persona({ goals: ['energy', 'performance'], circuit: { flags: ['heart'], none: false } }), MOCK_CATALOGUE)
    for (const p of products(r.tiers.complete)) expect(ingredientsOf(p).has('caffeine')).toBe(false)
  })

  it('keeps caffeine out at four or more drinks a day', () => {
    const r = runStackEngine(persona({ goals: ['energy', 'performance'], caffeine: { coffee: CAFFEINE_CEILING, tea: 0, energy: 0 } }), MOCK_CATALOGUE)
    for (const p of products(r.tiers.complete)) expect(ingredientsOf(p).has('caffeine')).toBe(false)
  })

  it('allows one caffeine source at most, counting a pre-workout already on the shelf', () => {
    const r = runStackEngine(persona({ goals: ['energy', 'performance'], caffeine: { coffee: 1, tea: 0, energy: 0 } }), MOCK_CATALOGUE)
    expect(products(r.tiers.complete).filter((p) => ingredientsOf(p).has('caffeine')).length).toBeLessThanOrEqual(1)
    const shelf = runStackEngine(persona({ goals: ['energy', 'performance'], shelf: ['pre-workout'] }), MOCK_CATALOGUE)
    expect(products(shelf.tiers.complete).filter((p) => ingredientsOf(p).has('caffeine'))).toHaveLength(0)
  })

  it('skips what they already take, and says so', () => {
    const r = runStackEngine(persona({ shelf: ['creatine'] }), MOCK_CATALOGUE)
    expect(r.tiers.complete).not.toContain('chrgd-creatine')
    expect(r.notes).toContain('Skipped: CHRGD Creatine Monohydrate, because you already take creatine')
  })

  it('never doubles up a family: one protein, one magnesium', () => {
    const r = runStackEngine(persona(), MOCK_CATALOGUE)
    const groups = products(r.tiers.complete).map((p) => p.swapGroup)
    expect(groups.filter((g) => g.startsWith('protein-'))).toHaveLength(1)
  })

  it('picks only vegan products for a fully plant-based plate', () => {
    const r = runStackEngine(persona({ plate: ['beans', 'greens', 'nuts', 'fruit'] }), MOCK_CATALOGUE)
    for (const p of products(r.tiers.complete)) expect(p.dietaryTags).toContain('vegan')
    expect(r.tiers.complete).toContain('chrgd-plant-protein')
  })

  it('gives every pick a reason that restates an answer or a goal', () => {
    const r = runStackEngine(persona(), MOCK_CATALOGUE)
    for (const p of r.ranked) expect(p.reason).toMatch(/goal|week|daylight|hours|restless|energy|plate|fish|spots|age|sessions|drinks/i)
  })

  it('never recommends a product that meets no need', () => {
    const r = runStackEngine(persona({ goals: ['performance'] }), MOCK_CATALOGUE)
    for (const p of r.ranked) expect(p.score).toBeGreaterThanOrEqual(1)
    expect(r.tiers.complete).not.toContain('chrgd-menopause-complete')
  })
})

describe('H5 charge profile', () => {
  it('reads each area straight off the answers', () => {
    const p = chargeProfile(persona())
    expect(p.training).toBe(100)
    expect(p.energy).toBe(40)
    expect(p.daylight).toBe(15)
    // Seven hours is enough; restless sleep takes it to 60.
    expect(p.sleep).toBe(60)
    expect(p.recovery).toBeLessThan(100)
  })

  it('keeps every score between 0 and 100', () => {
    const extremes = [
      persona({ week: Array(7).fill('gym'), intensity: 'hard' }),
      persona({ body: ['neck', 'shoulders', 'lower-back', 'hips', 'knees'] }),
      persona({ energy: 1, sleep: { bed: 2 * 60, wake: 5 * 60, quality: 'broken' } }),
      { ...EMPTY_ANSWERS },
    ]
    for (const a of extremes) {
      for (const v of Object.values(chargeProfile(a))) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(100)
      }
    }
  })

  it('moves the right way: more sun, more fish, fewer sore spots all score higher', () => {
    expect(chargeProfile(persona({ daylight: 'daily' })).daylight).toBeGreaterThan(chargeProfile(persona()).daylight)
    expect(chargeProfile(persona({ plate: ['oily-fish', 'poultry', 'eggs', 'fruit'] })).nutrition).toBeGreaterThan(chargeProfile(persona()).nutrition)
    expect(chargeProfile(persona({ body: ['knees'] })).recovery).toBeLessThan(chargeProfile(persona()).recovery)
  })
})
