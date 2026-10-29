/**
 * "Start here" in the read's story (plan Phase 8): the hero, the classics at
 * the depth the results page opens on, and the gift when that depth
 * qualifies, from the results page's own working.
 */
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { initialFlow } from '@/lib/consult/flow'
import { PERSONAS } from '@/lib/consult/personas'
import { stopReason } from '@/lib/consult/circuit'
import { prepareResults } from '@/lib/consult/results'
import { offerFitFor } from '@/lib/consult/offer-fit'
import { consultTiersWithHero } from '@/lib/consult/tiers'
import { CLAIMS } from '@/lib/consult/claims'
import { DEFAULT_OFFER } from '../settings'
import { startHere } from '../start-here'
import { TODAY, allOn } from './fixtures'

const live = PERSONAS.filter((p) => !stopReason(p.answers))
const WORDINGS = new Set(Object.values(CLAIMS).map((c) => c.wording))

function bundleFor(answers: (typeof live)[number]['answers']) {
  const state = { ...initialFlow('c_start000001', 0, answers), phase: 'analysis' as const, sceneId: 'circuit' as const }
  return prepareResults(state, MOCK_CATALOGUE, new Date('2026-11-02T10:00:00Z'), offerFitFor)
}

function startFor(answers: (typeof live)[number]['answers'], settings = allOn()) {
  const b = bundleFor(answers)
  return { b, s: startHere({ blueprint: b.blueprint, tiers: { ...b.payload.tiers }, snapshot: b.offerFit, catalogue: MOCK_CATALOGUE, answers: b.answers, settings, claims: b.read.products, today: TODAY }) }
}

describe('Start here', () => {
  it.each(live.map((p) => [p.id, p] as const))('%s: hero first, the classics at Standard, the gift never one of them, claims verbatim', (_, persona) => {
    const { b, s } = startFor(persona.answers)
    const ids = s.classics.map((c) => c.product.id)
    if (s.hero) expect(ids).not.toContain(s.hero.product.id)
    if (s.gift) {
      expect(ids).not.toContain(s.gift.id)
      expect(s.gift.id).not.toBe(s.hero?.product.id)
    }
    // The depth keeps its size with the hero in it.
    const standard = consultTiersWithHero({ ...b.payload.tiers }, s.hero?.product.id ?? null).standard
    expect(ids.length + (s.hero ? 1 : 0)).toBeLessThanOrEqual(standard.length)
    for (const c of [s.hero, ...s.classics]) if (c?.claim) expect(WORDINGS.has(c.claim)).toBe(true)
  })

  it('with the offer switched off: no hero, no gift, the consult’s own Standard', () => {
    const p = live[0]
    const { b, s } = startFor(p.answers, DEFAULT_OFFER)
    expect(s.hero).toBeNull()
    expect(s.gift).toBeNull()
    expect(s.classics.map((c) => c.product.id)).toEqual(b.payload.tiers.standard)
    expect(s.level).toBe('performance')
  })

  it('finds a hero and a gift for someone, with every switch on', () => {
    const found = live.map((p) => startFor(p.answers).s)
    expect(found.some((s) => s.hero)).toBe(true)
    expect(found.some((s) => s.gift)).toBe(true)
    // Claims show, verbatim, where the read carries one.
    expect(found.some((s) => s.classics.some((c) => c.claim))).toBe(true)
  })
})
