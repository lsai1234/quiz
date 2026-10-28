/**
 * The consult payoff (plan Phase 5): every product reason, the hero's
 * included, passes the claims maps; habit fixes and GP lines only show once
 * approved; the results page's tiers are the consult's own; the top
 * pinpointed pattern names the result.
 */
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { stopReason } from '../circuit'
import { NEUTRAL_REASON, runStackEngine, scoreNeeds } from '../engine'
import { PERSONAS } from '../personas'
import { GOAL_TO_QUIZ } from '../adapter'
import { consultOffer } from '../offer'
import { buildRead, readIdentity } from '../read'
import { approvedHabits, habitsFor, HABITS } from '../habits'
import { approvedGpChecks, gpChecksFor, GP_CHECKS } from '../gp-check'
import { consultTierPlans, consultTiersWithHero } from '../tiers'
import { toBlueprint, toQuizAnswers } from '../adapter'
import { buildHandoff } from '../handoff'
import { chargeProfile } from '../profile'
import { goalClaimFor, goalsBackedBy } from '@/lib/results/goal-claims'
import { needClaimFor, patternClaimFor, previewConsultClaims } from '@/lib/results/consult-claims'
import { claimsFor } from '../claims'
import { familyOf } from '../knowledge'
import { allOn, TODAY } from '@/lib/offer/__tests__/fixtures'
import type { ConsultAnswers } from '../types'

const live = PERSONAS.filter((p) => !stopReason(p.answers))
const byId = new Map(MOCK_CATALOGUE.map((p) => [p.id, p]))

/** Whether this reason may sit beside this product: some source with these words is allowed, and its claim is the one given. */
function passes(answers: ConsultAnswers, productId: string, reason: string, claim: string | null): boolean {
  if (reason === NEUTRAL_REASON) return claim === null
  const product = byId.get(productId)!
  const needs = scoreNeeds(answers)
  for (const [need, score] of Object.entries(needs)) {
    for (const s of score.sources) {
      if (s.why !== reason) continue
      const o = s.origin ?? { kind: 'answer' }
      const allowed =
        o.kind === 'answer'
          ? (claimsFor(product.swapGroup)[0] ?? null)
          : o.kind === 'goal'
          ? goalClaimFor(GOAL_TO_QUIZ[o.goal], product)?.id
          : o.kind === 'pattern'
          ? patternClaimFor(o.pattern, product)?.id
          : needClaimFor(need as never, product)?.id
      if (allowed !== undefined && allowed === claim) return true
    }
  }
  return false
}

describe('claims-aware reasons', () => {
  for (const signed of [false, true]) {
    it.each(live.map((p) => [p.id, p] as const))(`%s: every product reason passes the maps (map ${signed ? 'signed off' : 'not live'})`, (_, persona) => {
      previewConsultClaims(signed)
      try {
        const engine = runStackEngine(persona.answers, MOCK_CATALOGUE)
        for (const r of engine.ranked) expect(passes(persona.answers, r.id, r.reason, r.reasonClaim)).toBe(true)
      } finally {
        previewConsultClaims(null)
      }
    })
  }

  it.each(live.map((p) => [p.id, p] as const))('%s: the hero’s reason names a goal only where the map backs its claim', (_, persona) => {
    const engine = runStackEngine(persona.answers, MOCK_CATALOGUE)
    const offer = consultOffer({ answers: persona.answers, engine, catalogue: MOCK_CATALOGUE, settings: allOn(), today: TODAY })
    if (!offer.hero) return
    const { reason, choice } = offer.hero
    if (reason.kind === 'goal') {
      expect(reason.claim).not.toBeNull()
      expect(goalsBackedBy(choice.product.swapGroup, reason.claim!.id)).toContain(reason.goal)
    } else {
      expect(reason.line).toBeNull()
    }
  })

  it('names no need or pattern until the map is signed off', () => {
    previewConsultClaims(false)
    try {
      for (const persona of live) {
        const engine = runStackEngine(persona.answers, MOCK_CATALOGUE)
        for (const r of engine.ranked) expect(r.reason).not.toMatch(/^For (your|being|an?|short|broken|eating|keeping|staying|recovering|training|long)/)
      }
    } finally {
      previewConsultClaims(null)
    }
  })
})

describe('habit fixes and GP lines', () => {
  it('shows every line once approved (all approved 2026-10-28), and nothing unapproved', () => {
    expect(HABITS.every((h) => h.approved)).toBe(true)
    expect(GP_CHECKS.every((g) => g.approved)).toBe(true)
    for (const persona of live) {
      const engine = runStackEngine(persona.answers, MOCK_CATALOGUE)
      const habits = habitsFor(persona.answers, engine.unmetGoals)
      expect(approvedHabits(habits)).toEqual(habits)
      expect(approvedGpChecks(gpChecksFor(persona.answers))).toEqual(gpChecksFor(persona.answers))
      // The gate still holds: a line nobody approved never shows.
      expect(approvedHabits(habits, () => false)).toEqual([])
      expect(approvedGpChecks(gpChecksFor(persona.answers), () => false)).toEqual([])
    }
  })

  it('shows a line once it is approved, and only that one', () => {
    const lines = habitsFor(PERSONAS.find((p) => p.id === 'p34')!.answers, [])
    expect(lines.length).toBeGreaterThan(0)
    expect(approvedHabits(lines, (id) => id === lines[0].id)).toEqual([lines[0]])
  })

  it('gives at most three, the same every time, worked out from their answers', () => {
    for (const persona of live) {
      const a = habitsFor(persona.answers, ['focus', 'sleep', 'energy'])
      expect(a.length).toBeLessThanOrEqual(3)
      expect(habitsFor(persona.answers, ['focus', 'sleep', 'energy'])).toEqual(a)
    }
    const sleeper = { ...PERSONAS[0].answers, sleep: { bed: 23 * 60, wake: 6 * 60 + 30, quality: 'restful' as const }, caffeine: { coffee: 2, tea: 0, energy: 0 } }
    const lights = HABITS.find((h) => h.id === 'lights-out')!
    expect(lights.text(sleeper)).toBe('Lights out by 11pm: seven hours’ sleep before your 6:30am alarm, with half an hour to drop off.')
    expect(lights.ring(sleeper)).toEqual({ kind: 'lights-out', at: 23 * 60 })
    const cut = HABITS.find((h) => h.id === 'caffeine-cut-off')!
    expect(cut.ring(sleeper)).toEqual({ kind: 'last-caffeine', at: 15 * 60, from: null })
  })
})

describe('the results page’s tiers', () => {
  it.each(live.map((p) => [p.id, p] as const))('%s: are the consult’s own, hero first, sizes kept', (_, persona) => {
    const engine = runStackEngine(persona.answers, MOCK_CATALOGUE)
    const payload = buildHandoff({ consultId: 'c_tiers00001', route: 'deep', goals: persona.answers.goals, profile: chargeProfile(persona.answers), engine })
    const blueprint = toBlueprint(payload, MOCK_CATALOGUE)
    const answers = toQuizAnswers(persona.answers, payload.excluded)
    const plans = consultTierPlans({ blueprint, tiers: payload.tiers, heroId: null, catalogue: MOCK_CATALOGUE, answers })
    const ids = (l: string) => plans.find((p) => p.level === l)?.slots.map((s) => s.selectedProductId)
    // Every depth shown is exactly a consult tier (equal depths fold into the shallower).
    expect(ids('essentials')).toEqual(payload.tiers.essentials)
    if (ids('performance')) expect(ids('performance')).toEqual(payload.tiers.standard)
    if (ids('complete')) expect(ids('complete')).toEqual(payload.tiers.complete)
    // With a hero, the same tiers `consultOffer` makes.
    const offer = consultOffer({ answers: persona.answers, engine, catalogue: MOCK_CATALOGUE, settings: allOn(), today: TODAY })
    if (offer.hero) {
      const heroId = offer.hero.choice.product.id
      const family = familyOf(offer.hero.choice.product)
      expect(consultTiersWithHero(payload.tiers, heroId, (id) => familyOf(byId.get(id)!) === family)).toEqual(offer.tiers)
    }
  })
})

describe('pattern identity', () => {
  it('is the top pinpointed pattern, never the weight-loss one, else none', () => {
    expect(readIdentity([{ id: 'wired', name: 'Wired and tired' }])).toBe('Wired and tired')
    expect(readIdentity([{ id: 'eating-less', name: 'Eating less, running low' }, { id: 'crash', name: 'The 3pm crash' }])).toBe('The 3pm crash')
    expect(readIdentity([{ id: 'eating-less', name: 'Eating less, running low' }])).toBeNull()
    expect(readIdentity([])).toBeNull()
  })

  it('names the stack from the read: "Wired and tired" for the persona who confirmed it', () => {
    const p34 = PERSONAS.find((p) => p.id === 'p34')!
    const engine = runStackEngine(p34.answers, MOCK_CATALOGUE)
    const read = buildRead({ consultId: 'c_x', answers: p34.answers, engine })
    expect(read.identity).toBe('Wired and tired')
    expect(read.patterns[0]).toMatchObject({ id: 'wired', state: 'yes' })
    expect(read.patterns[0].evidence.length).toBeGreaterThan(0)
    expect(read.checked.every((n) => /^(Kept out|Skipped):/.test(n))).toBe(true)
  })

  it('keeps the profile in words for a run with nothing pinpointed', () => {
    const speed = PERSONAS.find((p) => p.id === 'p24')!
    const read = buildRead({ consultId: 'c_y', answers: speed.answers, engine: runStackEngine(speed.answers, MOCK_CATALOGUE) })
    expect(read.patterns).toEqual([])
    expect(read.identity).toBeNull()
    expect(read.profile).not.toBeNull()
  })
})
