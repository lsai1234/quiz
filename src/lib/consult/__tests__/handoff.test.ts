import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { planTiers } from '@/lib/stack-blueprint/tier-plan'
import { identityFor, toBlueprint, toQuizAnswers } from '../adapter'
import { runStackEngine } from '../engine'
import { HANDOFF_VERSION, buildHandoff, loadHandoffLocally, saveHandoffLocally, validateHandoff } from '../handoff'
import { chargeProfile } from '../profile'
import { prepareResults } from '../results'
import { initialFlow } from '../flow'
import { EMPTY_ANSWERS, type ConsultAnswers } from '../types'

const answers: ConsultAnswers = {
  ...EMPTY_ANSWERS,
  route: 'deep',
  goals: ['performance', 'sleep'],
  age: '35-44',
  sex: 'male',
  week: ['gym', 'rest', 'gym', 'rest', 'gym', 'cardio', 'sport'],
  intensity: 'steady',
  energy: 4,
  sleep: { bed: 1380, wake: 360, quality: 'broken' },
  daylight: 'hardly',
  caffeine: { coffee: 2, tea: 1, energy: 0 },
  plate: ['red-meat', 'poultry', 'eggs', 'fruit'],
  body: [],
  shelf: ['creatine'],
  circuit: { flags: ['blood-thinners'], none: false },
  healthConsent: { accepted: true, version: 'x', at: 'x' },
}

function payload() {
  return buildHandoff({
    consultId: 'c_8f2kq0test00',
    route: 'deep',
    goals: answers.goals,
    profile: chargeProfile(answers),
    engine: runStackEngine(answers, MOCK_CATALOGUE),
    now: new Date('2026-09-25T12:00:00Z'),
  })
}

describe('H7 handoff payload', () => {
  it('is versioned and carries the shape the plan specifies', () => {
    const p = payload()
    expect(p.version).toBe(HANDOFF_VERSION)
    expect(Object.keys(p).sort()).toEqual(
      ['consult_id', 'created_at', 'engine', 'excluded', 'flags', 'goals', 'notes', 'profile', 'reasons', 'route', 'tiers', 'version'].sort(),
    )
    expect(p.flags.pharmacist_note).toBe(true)
    expect(p.excluded).toEqual(expect.arrayContaining(['fish-oil', 'vitamin-k']))
  })

  it('validates against its schema on every consult', () => {
    expect(validateHandoff(payload()).ok).toBe(true)
  })

  it.each([
    ['a wrong version', (p: ReturnType<typeof payload>) => ({ ...p, version: 'consult-1.0' })],
    ['tiers that aren’t nested', (p: ReturnType<typeof payload>) => ({ ...p, tiers: { ...p.tiers, complete: p.tiers.complete.slice(1) } })],
    ['a SKU with no reason', (p: ReturnType<typeof payload>) => ({ ...p, reasons: {} })],
    ['an unknown exclusion', (p: ReturnType<typeof payload>) => ({ ...p, excluded: ['everything'] })],
    ['a profile out of range', (p: ReturnType<typeof payload>) => ({ ...p, profile: { ...p.profile, sleep: 140 } })],
    ['four goals', (p: ReturnType<typeof payload>) => ({ ...p, goals: ['performance', 'sleep', 'focus', 'energy'] })],
  ])('rejects %s', (_name, breakIt) => {
    expect(validateHandoff(breakIt(payload())).ok).toBe(false)
  })

  it('holds no circuit check answers, only what they rule out', () => {
    expect(JSON.stringify(payload())).not.toMatch(/blood-thinners|healthConsent|circuit/)
  })

  it('saves against the consult ID on the device and reads it back', () => {
    localStorage.clear()
    saveHandoffLocally(payload())
    expect(loadHandoffLocally()?.consult_id).toBe('c_8f2kq0test00')
  })
})

describe('H8 results page adapter', () => {
  it('passes the ranking through as the page’s stack, top pick first, with reasons', () => {
    const p = payload()
    const bp = toBlueprint(p, MOCK_CATALOGUE)
    expect(bp.slots.map((s) => s.selectedProductId)).toEqual(p.tiers.complete)
    for (const slot of bp.slots) expect(slot.reason).toBe(p.reasons[slot.selectedProductId])
    expect(bp.estimatedOneOffPrice).toBeGreaterThan(0)
  })

  it('lets the existing page show all three stacks from a consult, unchanged', () => {
    const p = payload()
    const bp = toBlueprint(p, MOCK_CATALOGUE)
    const plans = planTiers(bp, MOCK_CATALOGUE, toQuizAnswers(answers))
    expect(plans.length).toBe(3)
    // Each depth the page offers is drawn from the consult's own picks.
    for (const plan of plans) for (const slot of plan.slots) expect(p.tiers.complete).toContain(slot.selectedProductId)
  })

  it('projects the answers the page reads, and never the health answers', () => {
    const q = toQuizAnswers(answers)
    expect(q.goals).toEqual(['performance', 'sleep-better'])
    expect(q.track).toBe('performance')
    expect(q.trainingFrequency).toBe('5-6x')
    expect(q.ageBracket).toBe('35-44')
    expect(q.safetyFlags).toEqual([])
    expect(q.healthDataConsent).toBeNull()
  })

  it('drops an id the catalogue doesn’t know rather than faking a product', () => {
    const p = { ...payload(), tiers: { essentials: ['ghost'], standard: ['ghost'], complete: ['ghost'] }, reasons: { ghost: 'x' } }
    expect(toBlueprint(p, MOCK_CATALOGUE).slots).toHaveLength(0)
  })

  it('names the identity from the top goal and the profile, with no AI', () => {
    const id = identityFor(payload())
    expect(id.name).toBe('Peak Protocol')
    expect(id.focusAreas).toHaveLength(3)
    expect(id.focusAreas[0]).toBe('Daylight')
    expect(id.routineFitScore).toBeGreaterThanOrEqual(40)
  })

  it('never names an area a speed run didn’t ask about as a focus area', () => {
    const id = identityFor({ ...payload(), route: 'speed' })
    expect(id.focusAreas).not.toContain('Daylight')
    expect(id.focusAreas).not.toContain('Nutrition')
  })

  it('prepares the whole bundle in one pass', () => {
    const bundle = prepareResults({ ...initialFlow('c_bundle00001', 0, answers), phase: 'analysis' }, MOCK_CATALOGUE)
    expect(bundle.blueprint.slots.length).toBe(bundle.payload.tiers.complete.length)
    expect(bundle.identity.name).toBeTruthy()
  })
})
