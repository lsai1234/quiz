import { PATTERNS } from '@/lib/consult/pinpoint/library'
import { personFor } from '@/lib/consult/pinpoint/__tests__/simulate'
import type { ConsultAnswers } from '@/lib/consult/types'
import { SHAREABLE_PATTERNS, canShare, dayShare, decodeStoryShare, dotsShare, encodeStoryShare, isShareablePattern, patternWords, sharedPattern, type StoryShare } from '../story'
import { readIdentity } from '@/lib/consult/read'

/**
 * Sharing a card from the read's story (plan Phase 8): a shared image and its
 * link carry no health information.
 */
const answered: ConsultAnswers = {
  ...personFor('everyday', ['wired', 'crash']),
  energyCurve: { points: [6, 7, 8, 7, 4, 3, 5, 6, 5, 4], how: 'preset', preset: 'dip-3pm' },
  circuit: { flags: ['heart', 'other-prescription'], none: false },
  symptoms: ['nausea'],
  body: ['knees'],
  name: 'Sam Example',
  email: 'sam@example.com',
  pinpoint: { started: true, stopped: false, steps: [{ kind: 'verdict', pattern: 'wired', verdict: 'yes', stage: 'pinpoint' }, { kind: 'verdict', pattern: 'stiff-starter', verdict: 'yes', stage: 'pinpoint' }] },
} as ConsultAnswers

/** Everything about the person that must never reach a shared card or its link. */
const NEVER = ['heart', 'prescription', 'nausea', 'knees', 'Sam', 'sam@example.com', 'Energy 4/10', 'coffees', 'Stiff starter', 'stiff-starter']

describe('which patterns may be shared (the proposal)', () => {
  it('leaves out weight loss, eating too little, and a body changing with age', () => {
    for (const id of ['eating-less', 'empty', 'stiff-starter', 'keeping-strong', 'staying-sharp', 'broken-nights']) expect(isShareablePattern(id)).toBe(false)
    for (const id of SHAREABLE_PATTERNS) expect(PATTERNS.some((p) => p.id === id)).toBe(true)
  })

  it('names the result only with a shareable pattern, so the stack card can carry the name too', () => {
    expect(readIdentity([{ id: 'stiff-starter', name: 'Stiff starter' }, { id: 'crash', name: 'The 3pm crash' }])).toBe('The 3pm crash')
    expect(readIdentity([{ id: 'eating-less', name: 'Eating less, running low' }])).toBeNull()
  })

  it('shares "What I spotted" and "Joining the dots" only with a shareable pattern found', () => {
    expect(sharedPattern([{ id: 'stiff-starter' }, { id: 'wired' }])).toBe('wired')
    expect(canShare('spotted', [{ id: 'stiff-starter' }])).toBe(false)
    expect(canShare('dots', [{ id: 'eating-less' }])).toBe(false)
    expect(canShare('day', [])).toBe(true)
    expect(canShare('try', [{ id: 'wired' }])).toBe(false)
    expect(canShare('share', [{ id: 'wired' }])).toBe(false)
  })
})

describe('what a card carries', () => {
  const cards: StoryShare[] = [
    dayShare(answered),
    { v: 1, card: 'spotted', pattern: 'wired' },
    dotsShare(answered, [{ id: 'wired' }, { id: 'stiff-starter' }]),
    { v: 1, card: 'start', hero: 'Clear Whey', products: ['Sport Multivitamin', 'Magnesium Glycinate'] },
  ]

  it.each(cards.map((c) => [c.card, c] as const))('%s: nothing about the person, and back intact through the link', (_, card) => {
    const json = JSON.stringify(card)
    for (const word of NEVER) expect(json).not.toContain(word)
    expect(decodeStoryShare(encodeStoryShare(card))).toEqual(card)
  })

  it('names only the shareable patterns among those found', () => {
    expect(dotsShare(answered, [{ id: 'wired' }, { id: 'stiff-starter' }]).named).toEqual(['wired'])
  })

  it('prints a pattern’s own words, from the library, never anything sent', () => {
    expect(patternWords('wired')).toEqual({ name: 'Wired and tired', line: expect.any(String) })
    expect(patternWords('broken-nights')).toBeNull()
  })
})

describe('a crafted link', () => {
  const crafted = (o: unknown) => decodeStoryShare(encodeStoryShare(o as StoryShare))

  it('is refused for a pattern that may not be shared, or one that doesn’t exist', () => {
    expect(crafted({ v: 1, card: 'spotted', pattern: 'eating-less' })).toBeNull()
    expect(crafted({ v: 1, card: 'spotted', pattern: 'diabetes' })).toBeNull()
    expect(crafted({ v: 1, card: 'dots', stars: [{ a: 0, d: 0.5, w: 0.5, s: 'yes' }], named: ['broken-nights'], narrowing: [5] })).toBeNull()
  })

  it('is refused for words that aren’t a product name, or a shape that isn’t ours', () => {
    expect(crafted({ v: 1, card: 'start', hero: null, products: ['Cures <b>anxiety</b>!'] })).toBeNull()
    expect(crafted({ v: 1, card: 'start', hero: 'x'.repeat(80), products: [] })).toBeNull()
    expect(crafted({ v: 1, card: 'day', sleep: [23 * 60, 6 * 60], cup: null, train: null, daylight: null, energy: null, note: 'hi' })).toEqual(expect.objectContaining({ card: 'day' }))
    expect(crafted({ v: 1, card: 'day', sleep: ['late', 1], cup: null, train: null, daylight: null, energy: null })).toBeNull()
    expect(crafted({ v: 1, card: 'try', text: 'Take this' })).toBeNull()
    expect(decodeStoryShare('not base64!')).toBeNull()
  })

  it('carries nothing extra through: what it decodes to is only our fields', () => {
    const back = crafted({ v: 1, card: 'day', sleep: null, cup: null, train: null, daylight: null, energy: null, note: 'heart condition' })
    expect(JSON.stringify(back)).not.toContain('heart')
  })
})
