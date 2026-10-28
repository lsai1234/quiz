import { droopFor, eyeOpen, moodFor, mouthFor, rigFor } from '../amp-rig'
import { ampReactionTo } from '../reactions'
import { CORE, TELLS } from '../pinpoint/__tests__/simulate'
import { EMPTY_ANSWERS, type ConsultAnswers } from '../types'

/** Amp's rig (plan Phase 7.2): the poses the consult sets from what's on screen. */
describe('live reactions while an input moves', () => {
  it('droops his eyelids as the bedtime gets later', () => {
    expect(droopFor(21 * 60)).toBe(0)
    expect(droopFor(23 * 60)).toBeCloseTo(0.5)
    expect(droopFor(60)).toBe(1)
    expect(droopFor(3 * 60)).toBe(1)
    const sleep = (bed: number) => rigFor('sleep', { ...EMPTY_ANSWERS, sleep: { bed, wake: 7 * 60, quality: null } }, true)
    expect(eyeOpen('watching', sleep(21 * 60))).toBe(1)
    expect(eyeOpen('watching', sleep(60))).toBeLessThan(eyeOpen('watching', sleep(23 * 60)))
  })

  it('glows with the energy level, squints while the sun moves, jitters as cups stack', () => {
    expect(rigFor('energy', { ...EMPTY_ANSWERS, energy: 8 }, true)).toEqual({ glow: 0.8 })
    expect(rigFor('daylight', EMPTY_ANSWERS, true)).toEqual({ squint: 1 })
    expect(rigFor('daylight', EMPTY_ANSWERS, false)).toEqual({})
    expect(eyeOpen('watching', { squint: 1 })).toBeCloseTo(0.35)
    const cups = { coffee: 1, tea: 0, energy: 0 }
    expect(ampReactionTo({ ...EMPTY_ANSWERS, caffeine: cups }, { caffeine: { ...cups, coffee: 2 } })).toBe('jitter')
    expect(ampReactionTo({ ...EMPTY_ANSWERS, caffeine: { ...cups, coffee: 2 } }, { caffeine: cups })).toBeNull()
  })

  it('keeps every other scene’s Amp as he was', () => {
    for (const id of ['goals', 'about', 'training', 'caffeine', 'food', 'review', 'circuit'] as const) expect([id, rigFor(id, EMPTY_ANSWERS, true)]).toEqual([id, {}])
  })
})

describe('moods from Pinpoint’s model', () => {
  const pinpoint = (a: Partial<ConsultAnswers>): ConsultAnswers => ({ ...EMPTY_ANSWERS, comfortOffered: true, route: 'pinpoint', pinpoint: { steps: [], stopped: false }, ...a }) as ConsultAnswers

  it('leans in once a lead passes 0.5', () => {
    expect(moodFor(pinpoint({ ...CORE.everyday, ...TELLS.wired('everyday') }))).toBe('leaning')
  })

  it('is curious while it’s unsure', () => {
    expect(moodFor(pinpoint({ ...CORE.ager }))).toBe('curious')
  })

  it('shows it on Pinpoint’s screens only', () => {
    const a = pinpoint({ ...CORE.everyday, ...TELLS.wired('everyday') })
    expect(rigFor('pinpoint', a, false).mood).toBe('leaning')
    expect(rigFor('follow-rest', a, false).mood).toBe('leaning')
    expect(rigFor('shelf', a, false).mood).toBeUndefined()
  })
})

describe('the face’s poses', () => {
  it('opens his eyes per state, the rig lowering them from there, never shut', () => {
    expect(eyeOpen('idle')).toBe(1)
    expect(eyeOpen('calm')).toBe(0.55)
    expect(eyeOpen('hunch')).toBe(0.65)
    expect(eyeOpen('calm', { droop: 1, squint: 1 })).toBe(0.2)
  })

  it('gives each state its mouth', () => {
    expect(mouthFor('charged', null)).toBe('grin')
    expect(mouthFor('calm', 'curious')).toBe('flat')
    expect(mouthFor('thinking', null)).toBe('o')
    expect(mouthFor('idle', 'curious')).toBe('o')
    expect(mouthFor('idle', 'leaning')).toBe('smile')
  })
})
