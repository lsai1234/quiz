import { CLAIMS } from '../claims'
import { trainingDays } from '@/lib/consult/training'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { planTiers } from '@/lib/stack-blueprint/tier-plan'
import { identityFor, toBlueprint, toQuizAnswers } from '../adapter'
import { runStackEngine } from '../engine'
import { HANDOFF_VERSION, buildHandoff, loadHandoffLocally, saveHandoffLocally, validateHandoff, type HandoffPayload } from '../handoff'
import { PERSONAS } from '../personas'
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
  training: trainingDays(['gym', 'rest', 'gym', 'rest', 'gym', 'cardio', 'sport']),
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
      ['because', 'claims', 'consult_id', 'created_at', 'engine', 'excluded', 'flags', 'goals', 'notes', 'patterns', 'profile', 'reasons', 'route', 'tiers', 'version'].sort(),
    )
    expect(p.flags.pharmacist_note).toBe(true)
    expect(p.excluded).toEqual(expect.arrayContaining(['fish-oil', 'vitamin-k']))
    // Off the Pinpoint route, it found nothing.
    expect(p.patterns).toEqual({ pinpointed: [], partly: [], ruled_out: [] })
    expect(p.because).toEqual({})
  })

  it('validates against its schema on every consult', () => {
    expect(validateHandoff(payload()).ok).toBe(true)
  })

  it('carries only register claim IDs, and refuses one it doesn’t know', () => {
    const p = payload()
    for (const id of p.tiers.complete) expect(Object.keys(p.claims)).toContain(id)
    for (const ids of Object.values(p.claims)) for (const id of ids) expect(CLAIMS[id]).toBeDefined()
    const sku = p.tiers.complete[0]
    const bad = validateHandoff({ ...p, claims: { ...p.claims, [sku]: ['boosts-immunity'] } })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.errors).toContain(`unknown claim boosts-immunity for ${sku}`)
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

  it('still reads a 2.0 payload, as having found nothing', () => {
    const { patterns: _p, because: _b, ...rest } = payload()
    const old = validateHandoff({ ...rest, version: 'consult-2.0' })
    expect(old.ok).toBe(true)
    if (old.ok) expect(old.payload.patterns).toEqual({ pinpointed: [], partly: [], ruled_out: [] })
    // 2.1 has to carry them.
    expect(validateHandoff(rest).ok).toBe(false)
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

describe('2.1: what Pinpoint found', () => {
  const wired = PERSONAS.find((p) => p.id === 'p34')!.answers
  const pinpointPayload = () =>
    buildHandoff({ consultId: 'c_pinpoint0001', route: 'pinpoint', goals: wired.goals, profile: chargeProfile(wired), engine: runStackEngine(wired, MOCK_CATALOGUE) })

  it('names the patterns, and which products are there for them, by id only', () => {
    const p = pinpointPayload()
    expect(p.patterns.pinpointed).toEqual(['wired'])
    expect(Object.keys(p.because).length).toBeGreaterThan(0)
    for (const [sku, ids] of Object.entries(p.because)) {
      expect(p.tiers.complete).toContain(sku)
      expect(ids).toEqual(['wired'])
    }
    expect(validateHandoff(p).ok).toBe(true)
    expect(JSON.stringify(p.patterns)).not.toMatch(/tired-then-awake|probe/)
  })

  it.each([
    ['an unknown pattern', (p: HandoffPayload) => ({ ...p, patterns: { ...p.patterns, pinpointed: ['anxiety'] } })],
    ['a pattern both found and ruled out', (p: HandoffPayload) => ({ ...p, patterns: { ...p.patterns, ruled_out: ['wired'] } })],
    ['a because for a product not in the stack', (p: HandoffPayload) => ({ ...p, because: { ...p.because, 'not-a-sku': ['wired'] } })],
    ['an empty because', (p: HandoffPayload) => ({ ...p, because: { [p.tiers.complete[0]]: [] } })],
  ])('rejects %s', (_name, breakIt) => {
    expect(validateHandoff(breakIt(pinpointPayload())).ok).toBe(false)
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
