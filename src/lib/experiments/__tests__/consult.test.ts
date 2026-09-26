import {
  DEFAULT_CONSULT_ROLLOUT,
  consultArmFor,
  heroOfferFor,
  normaliseConsultRollout,
  parseConsultArm,
} from '../consult'

describe('H11 consult rollout', () => {
  it('defaults to off: customers see the quiz only, founders use /quizv2', () => {
    expect(DEFAULT_CONSULT_ROLLOUT.mode).toBe('off')
    expect(heroOfferFor(10, DEFAULT_CONSULT_ROLLOUT)).toBe('quiz-only')
  })

  it('switches without a deploy: off, option and all apply to everyone', () => {
    for (let b = 0; b < 100; b += 7) {
      expect(heroOfferFor(b, { mode: 'off', split: 50, ai: false })).toBe('quiz-only')
      expect(heroOfferFor(b, { mode: 'option', split: 50, ai: false })).toBe('both')
      expect(heroOfferFor(b, { mode: 'all', split: 50, ai: false })).toBe('consult-only')
    }
  })

  it('splits traffic by bucket, in the proportion asked', () => {
    for (const split of [0, 10, 25, 50, 75, 100]) {
      const consult = Array.from({ length: 100 }, (_, b) => heroOfferFor(b, { mode: 'split', split, ai: false })).filter((o) => o === 'consult-only').length
      expect(consult).toBe(split)
    }
  })

  it('keeps a visitor on the same side of the split', () => {
    expect(heroOfferFor(3, { mode: 'split', split: 50, ai: false })).toBe(heroOfferFor(3, { mode: 'split', split: 50, ai: false }))
  })

  it('reads the bucket from the other end from the quiz experiment, so the two splits don’t stack', () => {
    // The quiz's v2 half is buckets 0–49; the consult's half is 50–99.
    expect(heroOfferFor(0, { mode: 'split', split: 50, ai: false })).toBe('quiz-only')
    expect(heroOfferFor(99, { mode: 'split', split: 50, ai: false })).toBe('consult-only')
  })

  it('falls back to the quiz without a bucket', () => {
    expect(heroOfferFor(null, { mode: 'split', split: 100, ai: false })).toBe('quiz-only')
  })

  it('lets a pin win over every live mode', () => {
    expect(heroOfferFor(0, { mode: 'option', split: 0, ai: false }, 'consult')).toBe('consult-only')
    expect(heroOfferFor(99, { mode: 'all', split: 100, ai: false }, 'quiz')).toBe('quiz-only')
  })

  it('never lets a pin open the consult to the public while it is off', () => {
    expect(heroOfferFor(0, { mode: 'off', split: 0, ai: false }, 'consult')).toBe('quiz-only')
  })

  it('keeps the AI layer off unless switched on', () => {
    expect(DEFAULT_CONSULT_ROLLOUT.ai).toBe(false)
    expect(normaliseConsultRollout({ mode: 'option', ai: 'yes' }).ai).toBe(false)
    expect(normaliseConsultRollout({ mode: 'option', ai: true }).ai).toBe(true)
  })

  it('normalises a bad stored setting rather than breaking the hero', () => {
    expect(normaliseConsultRollout(null)).toEqual(DEFAULT_CONSULT_ROLLOUT)
    expect(normaliseConsultRollout({ mode: 'everything', split: 400, ai: false })).toEqual({ mode: 'off', split: 100, ai: false })
    expect(parseConsultArm('nope')).toBeNull()
    expect(consultArmFor('consult-only')).toBe('consult')
  })
})
