import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { runStackEngine, scoreNeeds } from '../../engine'
import { trainingDays } from '../../training'
import { EMPTY_ANSWERS, type ConsultAnswers } from '../../types'
import { LIMITS, focus, nextStep, questionsLeft } from '../choose'
import { pinpointEffects, pinpointed } from '../effects'
import { eligiblePatterns, leads } from '../leads'
import { entropy, evidence, itemGain, likelihoods } from '../model'
import { PROBE_BY_ID } from '../library'
import { hunchEvidence, nameInText, pinpointReaction, ruledOutBecause, whyAsking } from '../playback'
import type { PatternId, PinpointStep } from '../types'

/** Sam: 34, office job, energy 3/10, six hours' sleep, four coffees. */
const sam: ConsultAnswers = {
  ...EMPTY_ANSWERS,
  route: 'pinpoint',
  goals: ['energy'],
  age: '35-44',
  sex: 'male',
  training: trainingDays(['gym', 'rest', 'rest', 'gym', 'rest', 'rest', 'rest']),
  energy: 3,
  sleep: { bed: 60, wake: 7 * 60, quality: 'ok' },
  daylight: 'some',
  caffeine: { coffee: 4, tea: 0, energy: 0 },
  plate: ['poultry', 'eggs', 'dairy', 'greens', 'fruit', 'wholegrains'],
  body: [],
  shelf: [],
  circuit: { flags: [], none: true },
  healthConsent: { accepted: true, version: 'test', at: '2026-09-27T00:00:00Z' },
  pinpoint: { steps: [], stopped: false },
}

const lead = (a: ConsultAnswers, id: PatternId) => leads(a).find((l) => l.pattern.id === id)!
const withSteps = (a: ConsultAnswers, ...steps: PinpointStep[]): ConsultAnswers => ({ ...a, pinpoint: { steps: [...(a.pinpoint?.steps ?? []), ...steps], stopped: false } })
const probe = (id: string, main: string, stage: PinpointStep['stage'] = 'pinpoint'): PinpointStep => ({ kind: 'probe', probe: id, answer: { main }, stage })

describe('the maths', () => {
  it('makes a pulling answer likelier from people it fits', () => {
    const item = PROBE_BY_ID['tired-then-awake'].items[0]
    const l = likelihoods(item, 'wired')!
    expect(l.fits[0]).toBeGreaterThan(l.doesnt[0])
    expect(evidence(item, 0, 'wired')).toBeGreaterThan(1)
    expect(evidence(item, 2, 'wired')).toBeLessThan(-1)
    expect(likelihoods(item, 'indoor')).toBeNull()
  })

  it('expects no gain when there’s nothing left to learn', () => {
    const item = PROBE_BY_ID['tired-then-awake'].items[0]
    expect(itemGain(item, 'wired', 0.5)).toBeGreaterThan(0.2)
    expect(itemGain(item, 'wired', 0.999)).toBeLessThan(0.02)
    expect(entropy(0.5)).toBeCloseTo(1)
  })
})

describe('leads', () => {
  it('starts from the core answers, with the evidence in the person’s words', () => {
    const wired = lead(sam, 'wired')
    expect(wired.p).toBeGreaterThan(0.5)
    expect(wired.support.map((e) => e.text)).toContain('4 caffeinated drinks a day')
    expect(lead(sam, 'short-sleep').support.map((e) => e.text)).toContain('About 6 hours a night')
  })

  it('only puts in play what fits the journey', () => {
    const ids = eligiblePatterns(sam).map((p) => p.id)
    expect(ids).toContain('wired')
    expect(ids).not.toContain('stiff-starter')
    expect(ids).not.toContain('not-recovering')
    const older = eligiblePatterns({ ...sam, age: '65-plus', goals: ['ageing'] }).map((p) => p.id)
    expect(older).toContain('stiff-starter')
    expect(older).not.toContain('wired')
  })

  it('moves with each answer, and locks on a verdict', () => {
    const before = lead(sam, 'wired').p
    const a = withSteps(sam, probe('eleven-pm', 'a'))
    expect(lead(a, 'wired').p).toBeGreaterThan(before)
    expect(lead(a, 'short-sleep').p).toBeLessThan(lead(sam, 'short-sleep').p)
    expect(lead(a, 'wired').support.some((e) => e.text === 'Mind racing at 11pm' && e.direct)).toBe(true)
    const yes = withSteps(a, { kind: 'verdict', pattern: 'wired', verdict: 'yes', stage: 'pinpoint' })
    expect(lead(yes, 'wired').state).toBe('yes')
    const after = withSteps(yes, probe('which-nights', 'b'))
    expect(lead(after, 'wired').state).toBe('yes')
  })

  it('follows a "Partly" with one more question, then settles', () => {
    const a = withSteps(sam, { kind: 'verdict', pattern: 'wired', verdict: 'partly', stage: 'pinpoint' })
    expect(lead(a, 'wired').state).toBe('checking')
    expect(lead(withSteps(a, probe('tired-then-awake', 'me')), 'wired').state).toBe('partly')
    expect(lead(withSteps(a, probe('tired-then-awake', 'not')), 'wired').state).toBe('out')
  })

  it('rules a pattern out on the answers alone, but never on one stray tap', () => {
    const one = withSteps(sam, probe('workday-daylight', 'not'))
    expect(lead(one, 'indoor').state).toBe('live')
    const two = withSteps(one, probe('dark-commute', 'not'), probe('whole-days-in', 'never'))
    expect(lead(two, 'indoor').state).toBe('out')
    expect(ruledOutBecause(lead(two, 'indoor'))).toBeTruthy()
  })

  it('treats "Not sure" as no answer at all', () => {
    const a = withSteps(sam, { kind: 'probe', probe: 'eleven-pm', answer: {}, unsure: true, stage: 'pinpoint' })
    expect(lead(a, 'wired').p).toBeCloseTo(lead(sam, 'wired').p, 10)
  })

  it('re-scores when a core answer changes on the review', () => {
    const noCoffee = { ...sam, caffeine: { coffee: 0, tea: 0, energy: 0 } }
    expect(lead(noCoffee, 'wired').p).toBeLessThan(lead(sam, 'wired').p)
  })
})

describe('what Amp asks next', () => {
  it('asks the question that best separates the leads, and says why', () => {
    const step = nextStep(sam, 'pinpoint')
    expect(step.kind).toBe('probe')
    if (step.kind !== 'probe') return
    expect(step.tells.length).toBeGreaterThan(0)
    expect(whyAsking(step.tells)).toMatch(/^It (tells|checks)/)
  })

  it('puts a backed lead to the person', () => {
    const a = withSteps(sam, probe('eleven-pm', 'a'), probe('tired-then-awake', 'me'))
    const step = nextStep(a, 'pinpoint')
    expect(step.kind).toBe('hunch')
    if (step.kind === 'hunch') {
      expect(step.lead.pattern.id).toBe('wired')
      expect(hunchEvidence(step.lead)).toEqual(expect.arrayContaining(['4 caffeinated drinks a day', 'Mind racing at 11pm']))
      // Three lines at most, so the card fits a small phone.
      expect(hunchEvidence(step.lead).length).toBeLessThanOrEqual(3)
    }
  })

  it('follows up in a core section only when it’s clearly worth it, and only once', () => {
    const step = nextStep(sam, 'follow-rest')
    expect(step.kind).toBe('probe')
    if (step.kind === 'probe') {
      expect(step.probe.area).toBe('rest')
      expect(step.gain).toBeGreaterThanOrEqual(LIMITS.followUpGain)
      expect(nextStep(withSteps(sam, probe(step.probe.id, 'a', 'follow-rest')), 'follow-rest').kind).toBe('done')
    }
  })

  it('stops when asked to', () => {
    expect(nextStep({ ...sam, pinpoint: { steps: [], stopped: true } }, 'pinpoint')).toEqual({ kind: 'done', reason: 'stopped' })
  })

  it('checks in at question ten', () => {
    let a = sam
    const ids = ['snooze', 'weekend-lie-in', 'phone-in-bed', 'clocks-back', 'lunchtime', 'sweet-fix', 'skip-lunch', 'names-keys', 'lose-thread', 'sitting-day']
    for (const id of ids) a = withSteps(a, probe(id, PROBE_BY_ID[id].items[0].options[1].key))
    const step = nextStep(a, 'pinpoint')
    expect(['checkpoint', 'hunch', 'done']).toContain(step.kind)
    if (step.kind !== 'hunch' && step.kind !== 'done') {
      const more = withSteps(a, { kind: 'checkpoint', choice: 'more', stage: 'pinpoint' })
      expect(nextStep(more, 'pinpoint').kind).not.toBe('checkpoint')
    }
  })

  it('reacts hot and cold', () => {
    const a = withSteps(sam, probe('eleven-pm', 'a'))
    expect(pinpointReaction(sam, a)).toMatch(/Thought so|Warmer|Interesting/)
    expect(nameInText('The 3pm crash')).toBe('the 3pm crash')
  })

  it('estimates what’s left and how focused Amp is', () => {
    expect(questionsLeft(sam)).toBeGreaterThanOrEqual(1)
    expect(questionsLeft(sam)).toBeLessThanOrEqual(6)
    const sure = withSteps(sam, { kind: 'verdict', pattern: 'wired', verdict: 'yes', stage: 'pinpoint' })
    expect(focus(sure)).toBeGreaterThan(focus(sam))
  })
})

describe('what it changes in the stack', () => {
  const pinned = withSteps(sam, { kind: 'verdict', pattern: 'wired', verdict: 'yes', stage: 'pinpoint' })

  it('adds a pinpointed pattern’s needs, in its own words', () => {
    const needs = scoreNeeds(pinned)
    expect(needs.sleep.sources.map((s) => s.why)).toContain('For being wired and tired')
    expect(pinpointEffects(pinned).map((e) => e.lead.pattern.id)).toEqual(['wired'])
    expect(pinpointed(pinned).map((l) => l.pattern.id)).toEqual(['wired'])
  })

  it('keeps out what a confirmed pattern says to, with the reason', () => {
    const result = runStackEngine(pinned, MOCK_CATALOGUE)
    expect(result.excludedIngredients).toContain('caffeine')
    expect(result.excludedIngredients).toContain('stimulant')
  })

  it('counts "Partly" lighter, and nothing on the other routes', () => {
    const partly = withSteps(sam, { kind: 'verdict', pattern: 'wired', verdict: 'partly', stage: 'pinpoint' }, probe('tired-then-awake', 'me'))
    expect(pinpointEffects(partly)[0].factor).toBeLessThan(1)
    expect(pinpointEffects({ ...pinned, route: 'deep' })).toEqual([])
    const deep = scoreNeeds({ ...pinned, route: 'deep' })
    expect(deep.sleep.sources.map((s) => s.why)).not.toContain('For being wired and tired')
  })

  it('never keeps anything out for "Partly" or a guess', () => {
    const partly = withSteps(sam, { kind: 'verdict', pattern: 'wired', verdict: 'partly', stage: 'pinpoint' }, probe('tired-then-awake', 'me'))
    const soft = { ...partly, caffeine: { coffee: 1, tea: 0, energy: 0 } }
    expect(runStackEngine(soft, MOCK_CATALOGUE).excludedIngredients).not.toContain('stimulant')
  })
})
